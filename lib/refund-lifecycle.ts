import { HttpError } from "./errors.ts";
import type { CommerceDB } from "./order-lifecycle.ts";

export type GatewayRefund = {
  id: string;
  payment_id: string;
  amount: number;
  status: "pending" | "processed" | "failed";
  notes?: { inshop_refund?: string };
};
/** Records an already completed offline COD payout; never initiates a transfer. */
export async function recordCodRefund(
  db: CommerceDB,
  id: string,
  reference: string,
  now = Date.now(),
) {
  if (!/^[A-Za-z0-9 _/-]{5,100}$/.test(reference))
    throw new HttpError(400, "Enter the completed payout reference.");
  const result = await db.batch([
    db
      .prepare(
        "UPDATE orders SET payment_status='refunded',data=json_insert(data,'$.history[#]',json(?)) WHERE method='cod' AND payment_status='refund-pending' AND id=(SELECT order_id FROM refunds WHERE id=? AND status='requested') RETURNING id",
      )
      .bind(
        JSON.stringify({
          status: "refund-recorded",
          at: now,
          note: "Offline COD payout: " + reference,
        }),
        id,
      ),
    db
      .prepare(
        "UPDATE refunds SET status='processed',gateway_id=?,updated_at=?,last_error=NULL WHERE id=? AND status='requested' AND EXISTS(SELECT 1 FROM orders WHERE id=refunds.order_id AND method='cod' AND payment_status='refunded')",
      )
      .bind("manual:" + reference, now, id),
  ]);
  if (!result[0].results.length)
    throw new HttpError(
      409,
      "Only an outstanding cash-on-delivery refund can be recorded.",
    );
}
export async function updateRefund(
  db: CommerceDB,
  refundId: string,
  g: GatewayRefund,
  now = Date.now(),
) {
  const r = await db
    .prepare(
      "SELECT r.order_id,r.amount,r.status,r.gateway_id,o.payment_id FROM refunds r JOIN orders o ON o.id=r.order_id WHERE r.id=?",
    )
    .bind(refundId)
    .first<{
      order_id: string;
      amount: number;
      status: string;
      gateway_id: string | null;
      payment_id: string;
    }>();
  if (
    !r ||
    g.amount !== r.amount ||
    g.payment_id !== r.payment_id ||
    (r.gateway_id && r.gateway_id !== g.id) ||
    !["pending", "processed", "failed"].includes(g.status)
  )
    throw new HttpError(409, "Refund does not match the stored payment.");
  if (r.status === "processed") return;
  await db.batch([
    db
      .prepare(
        "UPDATE refunds SET gateway_id=?,status=?,updated_at=?,last_error=NULL WHERE id=? AND status!='processed'",
      )
      .bind(g.id, g.status, now, refundId),
    db
      .prepare(
        "UPDATE orders SET payment_status=CASE WHEN ?='processed' THEN 'refunded' ELSE 'refund-pending' END WHERE id=? AND payment_status!='refunded'",
      )
      .bind(g.status, r.order_id),
  ]);
}

export async function submitRefund(
  db: CommerceDB,
  id: string,
  submit: (
    payment: string,
    amount: number,
    key: string,
  ) => Promise<GatewayRefund>,
  now = Date.now(),
) {
  const r = await db
    .prepare(
      "UPDATE refunds SET status='submitting',updated_at=?,last_error=NULL WHERE id=? AND (status IN ('requested','uncertain') OR (status='submitting' AND updated_at<?)) RETURNING *",
    )
    .bind(now, id, now - 120000)
    .first<{ id: string; order_id: string; amount: number }>();
  if (!r)
    throw new HttpError(
      409,
      "Refund is already processing or requires reconciliation.",
    );
  const order = await db
    .prepare(
      "SELECT payment_id FROM orders WHERE id=? AND method='razorpay' AND payment_status='refund-pending'",
    )
    .bind(r.order_id)
    .first<{ payment_id: string }>();
  if (!order?.payment_id) {
    await db
      .prepare("UPDATE refunds SET status='requested',last_error=? WHERE id=?")
      .bind("No refundable captured payment is attached.", id)
      .run();
    throw new HttpError(
      409,
      "No captured online payment is available for this refund.",
    );
  }
  try {
    await updateRefund(
      db,
      id,
      await submit(order.payment_id, r.amount, "inshop_refund_" + id),
      now,
    );
  } catch (e) {
    await db
      .prepare(
        "UPDATE refunds SET status='uncertain',updated_at=?,last_error=? WHERE id=? AND status='submitting'",
      )
      .bind(
        now,
        "Provider confirmation unavailable. Retry with the same refund key.",
        id,
      )
      .run();
    throw e;
  }
}
