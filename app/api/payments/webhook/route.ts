import { config, database } from "../../../../lib/database";
import { errorResponse, HttpError } from "../../../../lib/security";
import {
  recordCapture,
  type CapturedPayment,
} from "../../../../lib/order-lifecycle";
import { updateRefund } from "../../../../lib/refund-lifecycle";
import { razorpay } from "../../../../lib/razorpay";
export async function POST(req: Request) {
  try {
    const secret = config("RAZORPAY_WEBHOOK_SECRET");
    if (!secret) throw new HttpError(503, "Payments unavailable");
    const raw = await req.text();
    if (raw.length > 200000) throw new HttpError(413, "Payload too large");
    const signature = req.headers.get("x-razorpay-signature") ?? "";
    if (!/^[a-f0-9]{64}$/i.test(signature))
      throw new HttpError(401, "Invalid signature");
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    if (
      !(await crypto.subtle.verify(
        "HMAC",
        key,
        Uint8Array.from(signature.match(/.{2}/g)!.map((s) => parseInt(s, 16))),
        new TextEncoder().encode(raw),
      ))
    )
      throw new HttpError(401, "Invalid signature");
    const eventId = req.headers.get("x-razorpay-event-id");
    if (!eventId || eventId.length > 200)
      throw new HttpError(400, "Missing event ID");
    let event;
    try {
      event = JSON.parse(raw);
    } catch {
      throw new HttpError(400, "Invalid event");
    }
    const db = database();
    if (
      await db
        .prepare("SELECT id FROM webhook_events WHERE id=?")
        .bind(eventId)
        .first()
    )
      return Response.json({ ok: true, duplicate: true });
    if (event.event === "payment.captured") {
      const paymentId = event.payload?.payment?.entity?.id;
      if (!/^pay_[A-Za-z0-9]+$/.test(paymentId ?? ""))
        throw new HttpError(400, "Invalid payment.");
      // Capture events can arrive after a dashboard refund: inspect current state.
      const current = await razorpay<CapturedPayment>(
        "/payments/" + encodeURIComponent(paymentId),
      );
      return Response.json({
        ok: true,
        ...(await recordCapture(db, eventId, current)),
      });
    }
    if (["refund.processed", "refund.failed"].includes(event.event)) {
      const refund = event.payload?.refund?.entity;
      const row = await db
        .prepare("SELECT id FROM refunds WHERE gateway_id=? OR id=?")
        .bind(refund?.id ?? "", refund?.notes?.inshop_refund ?? "")
        .first<{ id: string }>();
      if (!row) {
        if (!/^pay_[A-Za-z0-9]+$/.test(refund?.payment_id ?? ""))
          throw new HttpError(400, "Invalid refund payment.");
        const current = await razorpay<CapturedPayment>(
          "/payments/" + encodeURIComponent(refund.payment_id),
        );
        if (
          (current.amount_refunded ?? 0) > 0 ||
          current.refund_status ||
          current.status === "refunded"
        )
          await recordCapture(db, eventId, current);
        else throw new HttpError(409, "Refund is awaiting reconciliation.");
      } else await updateRefund(db, row.id, refund);
    }
    await db
      .prepare("INSERT OR IGNORE INTO webhook_events VALUES (?,?,?)")
      .bind(eventId, event.event ?? "unknown", Date.now())
      .run();
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
