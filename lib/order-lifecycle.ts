import { HttpError } from "./errors.ts";

export type CommerceDB = Pick<D1Database, "prepare" | "batch">;

/** Every statement rechecks eligibility inside the atomic D1 batch. */
export async function releaseOrder(
  db: CommerceDB,
  id: string,
  userId: string | null,
  reason: string,
  now = Date.now(),
  expiry = false,
) {
  const eligible = `id=? AND inventory_released=0 AND status IN ('placed','processing') ${expiry ? "AND method='razorpay' AND payment_status='pending' AND expires_at<=?" : "AND payment_status IN ('pending','due','paid')"} ${userId ? "AND user_id=?" : ""}`;
  const args: (string | number)[] = [
    id,
    ...(expiry ? [now] : []),
    ...(userId ? [userId] : []),
  ];
  const gate = `EXISTS (SELECT 1 FROM orders WHERE ${eligible})`;
  const status = expiry ? "expired" : "cancelled";
  const event = JSON.stringify({ status, at: now, note: reason });
  const result = await db.batch([
    db
      .prepare(
        `INSERT INTO inventory_transactions (id,product_id,order_id,delta,reason,created_at) SELECT lower(hex(randomblob(16))),product_id,order_id,quantity,?,? FROM order_items WHERE order_id=? AND ${gate}`,
      )
      .bind(reason, now, id, ...args),
    db
      .prepare(
        `UPDATE products SET stock=stock+(SELECT SUM(quantity) FROM order_items WHERE order_id=? AND product_id=products.id),updated_at=? WHERE id IN (SELECT product_id FROM order_items WHERE order_id=?) AND ${gate}`,
      )
      .bind(id, now, id, ...args),
    db
      .prepare(
        `UPDATE coupons SET remaining=remaining+1 WHERE code=(SELECT json_extract(data,'$.coupon') FROM orders WHERE id=?) AND ${gate}`,
      )
      .bind(id, ...args),
    db
      .prepare(`DELETE FROM coupon_uses WHERE order_id=? AND ${gate}`)
      .bind(id, ...args),
    db
      .prepare(
        `INSERT OR IGNORE INTO refunds (id,order_id,status,amount,created_at,updated_at) SELECT ?,id,'requested',total,?,? FROM orders WHERE ${eligible} AND payment_status='paid'`,
      )
      .bind(crypto.randomUUID(), now, now, ...args),
    db
      .prepare(
        `INSERT INTO notifications (id,user_id,title,href,read,created_at) SELECT ?,user_id,?, '/account/orders/'||reference,0,? FROM orders WHERE ${eligible}`,
      )
      .bind(
        crypto.randomUUID(),
        expiry
          ? "Payment window expired; your items were released"
          : "Your order was cancelled",
        now,
        ...args,
      ),
    db
      .prepare(
        `UPDATE orders SET inventory_released=1,status=?,payment_status=CASE WHEN payment_status='paid' THEN 'refund-pending' ELSE payment_status END,data=json_insert(data,'$.history[#]',json(?)) WHERE ${eligible} RETURNING id`,
      )
      .bind(status, event, ...args),
  ]);
  return result.at(-1)!.results.length > 0;
}

export async function expireReservations(db: CommerceDB, now = Date.now()) {
  const rows = await db
    .prepare(
      "SELECT id FROM orders WHERE method='razorpay' AND payment_status='pending' AND inventory_released=0 AND status='placed' AND expires_at<=? LIMIT 100",
    )
    .bind(now)
    .all<{ id: string }>();
  let released = 0;
  for (const row of rows.results)
    if (
      await releaseOrder(
        db,
        row.id,
        null,
        "Payment reservation expired",
        now,
        true,
      )
    )
      released++;
  return released;
}

export type CapturedPayment = {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: string;
  captured?: boolean;
  amount_refunded?: number;
  refund_status?: string | null;
};
export async function recordCapture(
  db: CommerceDB,
  eventId: string,
  p: CapturedPayment,
  now = Date.now(),
) {
  if (
    !p ||
    !/^pay_[A-Za-z0-9]+$/.test(p.id ?? "") ||
    !p.order_id ||
    !["captured", "refunded"].includes(p.status) ||
    p.captured === false ||
    p.currency !== "INR" ||
    !Number.isSafeInteger(p.amount)
  )
    throw new HttpError(400, "Invalid captured payment.");
  if (
    await db
      .prepare("SELECT id FROM webhook_events WHERE id=?")
      .bind(eventId)
      .first()
  )
    return { duplicate: true };
  const order = await db
    .prepare(
      "SELECT id,total,payment_id FROM orders WHERE gateway_id=? AND method='razorpay'",
    )
    .bind(p.order_id)
    .first<{ id: string; total: number; payment_id: string | null }>();
  if (
    !order ||
    order.total !== p.amount ||
    (order.payment_id && order.payment_id !== p.id)
  )
    throw new HttpError(409, "Payment does not match the payable order.");
  if (
    (p.amount_refunded ?? 0) > 0 ||
    p.refund_status ||
    p.status === "refunded"
  ) {
    await db.batch([
      db
        .prepare(
          "UPDATE orders SET payment_id=?,payment_status='review-required' WHERE id=? AND payment_status NOT IN ('refunded','refund-pending')",
        )
        .bind(p.id, order.id),
      db
        .prepare("INSERT OR IGNORE INTO webhook_events VALUES (?,?,?)")
        .bind(eventId, "payment.review-required", now),
    ]);
    return { duplicate: false, reviewRequired: true };
  }
  try {
    await db.batch([
      db
        .prepare("INSERT INTO webhook_events VALUES (?,?,?)")
        .bind(eventId, "payment.captured", now),
      db
        .prepare(
          "UPDATE orders SET payment_id=?,payment_status=CASE WHEN inventory_released=1 OR status IN ('cancelled','expired') THEN 'refund-pending' ELSE 'paid' END,data=json_insert(data,'$.history[#]',json(?)) WHERE id=? AND payment_status='pending'",
        )
        .bind(
          p.id,
          JSON.stringify({ status: "payment-confirmed", at: now }),
          order.id,
        ),
      db
        .prepare(
          "INSERT OR IGNORE INTO refunds (id,order_id,status,amount,created_at,updated_at) SELECT ?,id,'requested',total,?,? FROM orders WHERE id=? AND payment_status='refund-pending'",
        )
        .bind(crypto.randomUUID(), now, now, order.id),
    ]);
  } catch (e) {
    if (
      await db
        .prepare("SELECT id FROM webhook_events WHERE id=?")
        .bind(eventId)
        .first()
    )
      return { duplicate: true };
    throw e;
  }
  return { duplicate: false };
}

export async function transitionOrder(
  db: CommerceDB,
  id: string,
  next: string,
  tracking?: string,
  courier?: string,
  cashCollected = false,
) {
  const previous: Record<string, string> = {
    processing: "placed",
    packed: "processing",
    shipped: "packed",
    "out-for-delivery": "shipped",
    delivered: "out-for-delivery",
  };
  const from = previous[next];
  if (!from) throw new HttpError(400, "Choose a valid fulfillment action.");
  if (next === "shipped" && (!tracking || !courier))
    throw new HttpError(
      400,
      "Courier and tracking number are required to ship an order.",
    );
  const result = await db
    .prepare(
      "UPDATE orders SET status=?,payment_status=CASE WHEN method='cod' AND ?='delivered' AND ?=1 THEN 'paid' ELSE payment_status END,data=json_insert(json_set(data,'$.tracking',COALESCE(?,json_extract(data,'$.tracking')),'$.courier',COALESCE(?,json_extract(data,'$.courier'))),'$.history[#]',json(?)) WHERE id=? AND status=? AND inventory_released=0 AND (payment_status='paid' OR (method='cod' AND payment_status='due' AND (?!='delivered' OR ?=1))) RETURNING id",
    )
    .bind(
      next,
      next,
      Number(cashCollected),
      tracking ?? null,
      courier ?? null,
      JSON.stringify({
        status: next,
        at: Date.now(),
        ...(cashCollected
          ? { note: "Administrator confirmed full cash collection" }
          : {}),
      }),
      id,
      from,
      next,
      Number(cashCollected),
    )
    .first();
  if (!result)
    throw new HttpError(
      409,
      "Order changed, is unpaid, or is not eligible for this action.",
    );
}
