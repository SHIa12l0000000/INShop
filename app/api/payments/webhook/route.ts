import { config, database } from "../../../../lib/database";
import { errorResponse, HttpError } from "../../../../lib/security";
export async function POST(req: Request) {
  try {
    const secret = config("RAZORPAY_WEBHOOK_SECRET");
    if (!secret) throw new HttpError(503, "Payments unavailable");
    const raw = await req.text();
    if (raw.length > 200000) throw new HttpError(413, "Too large");
    const sig = req.headers.get("x-razorpay-signature") ?? "";
    if (!/^[a-f0-9]{64}$/i.test(sig))
      throw new HttpError(401, "Invalid signature");
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      Uint8Array.from(sig.match(/.{2}/g)!.map((h) => parseInt(h, 16))),
      new TextEncoder().encode(raw),
    );
    if (!valid) throw new HttpError(401, "Invalid signature");
    const e = JSON.parse(raw);
    const eventId = req.headers.get("x-razorpay-event-id");
    if (!eventId) throw new HttpError(400, "Missing event ID");
    const db = database();
    if (
      await db
        .prepare("SELECT id FROM webhook_events WHERE id=?")
        .bind(eventId)
        .first()
    )
      return Response.json({ ok: true, duplicate: true });
    if (e.event === "payment.captured") {
      const p = e.payload?.payment?.entity;
      const o = await db
        .prepare("SELECT id,total,status FROM orders WHERE gateway_id=?")
        .bind(p?.order_id ?? "")
        .first<{ id: string; total: number; status: string }>();
      if (
        !o ||
        o.total !== p.amount ||
        p.currency !== "INR" ||
        p.status !== "captured"
      )
        throw new HttpError(400, "Payment does not match order");
      if (o.status === "cancelled")
        throw new HttpError(
          409,
          "Cancelled order requires payment reconciliation",
        );
      await db.batch([
        db
          .prepare("INSERT INTO webhook_events VALUES (?,?,?)")
          .bind(eventId, e.event, Date.now()),
        db
          .prepare(
            "UPDATE orders SET payment_status='paid' WHERE id=? AND payment_status='pending'",
          )
          .bind(o.id),
      ]);
    } else
      await db
        .prepare("INSERT OR IGNORE INTO webhook_events VALUES (?,?,?)")
        .bind(eventId, e.event ?? "unknown", Date.now())
        .run();
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
