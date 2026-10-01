import { database, config } from "./database";
import { checkoutSchema } from "./commerce";
import { checkoutQuote } from "./checkout-quote";
import { expireReservations, releaseOrder } from "./order-lifecycle";
import { HttpError } from "./errors";
import type { User } from "./types";

export async function createOrder(user: User, payload: unknown) {
  const v = checkoutSchema.parse(payload),
    db = database();
  const request = JSON.stringify({
    items: [...v.items].sort((a, b) => a.id.localeCompare(b.id)),
    address: v.address,
    method: v.method,
    coupon: v.coupon.trim().toUpperCase(),
  });
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(request),
  );
  const fingerprint = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const previous = await db
    .prepare("SELECT * FROM orders WHERE user_id=? AND idempotency_key=?")
    .bind(user.id, v.idempotencyKey)
    .first<{ data: string }>();
  if (previous) {
    if (JSON.parse(previous.data).fingerprint !== fingerprint)
      throw new HttpError(
        409,
        "This checkout attempt has different items. Start a new checkout.",
      );
    return previous;
  }
  if (config("COMMERCE_ENABLED") !== "true")
    throw new HttpError(
      503,
      "Checkout is not open yet. The store owner needs to finish setup.",
    );
  await expireReservations(db);
  const { lines, totals, coupon, settings } = await checkoutQuote(
    { ...v, pin: v.address.pin },
    user.id,
    true,
  );
  if (
    v.method === "cod" &&
    (!settings.codEnabled || totals.total > (settings.codMaximum ?? 500000))
  )
    throw new HttpError(400, "Cash on delivery is unavailable for this order.");
  if (
    v.method === "razorpay" &&
    (!config("RAZORPAY_KEY_ID") ||
      !config("RAZORPAY_KEY_SECRET") ||
      !config("RAZORPAY_WEBHOOK_SECRET"))
  )
    throw new HttpError(503, "Online payments have not been connected.");
  if (v.expectedTotal !== undefined && v.expectedTotal !== totals.total)
    throw new HttpError(
      409,
      "The order total changed. Refresh the quote and review it before placing your order.",
    );
  const id = crypto.randomUUID(),
    now = Date.now();
  const reference = `INS-${new Date(now).getUTCFullYear().toString().slice(-2)}-${crypto.randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`;
  const data = {
    address: v.address,
    items: lines,
    totals,
    history: [{ status: "placed", at: now }],
    coupon: coupon?.code ?? null,
    fingerprint,
  };
  const sql = [
    db
      .prepare(
        "INSERT INTO orders (id,reference,user_id,idempotency_key,status,payment_status,method,total,data,created_at,expires_at) VALUES (?,?,?,?,'placed',?,?,?,?,?,?)",
      )
      .bind(
        id,
        reference,
        user.id,
        v.idempotencyKey,
        v.method === "cod" ? "due" : "pending",
        v.method,
        totals.total,
        JSON.stringify(data),
        now,
        v.method === "razorpay" ? now + 30 * 60000 : null,
      ),
  ];
  for (const l of lines) {
    sql.push(
      db
        .prepare(
          "UPDATE products SET stock=CASE WHEN price=? AND status='active' AND COALESCE(json_extract(data,'$.demo'),0)=0 THEN stock-? ELSE -1 END,updated_at=? WHERE id=?",
        )
        .bind(l.price, l.quantity, now, l.id),
    );
    sql.push(
      db
        .prepare("INSERT INTO order_items VALUES (?,?,?,?,?,?)")
        .bind(
          crypto.randomUUID(),
          id,
          l.id,
          l.quantity,
          l.price,
          JSON.stringify(l),
        ),
    );
    sql.push(
      db
        .prepare("INSERT INTO inventory_transactions VALUES (?,?,?,?,?,?)")
        .bind(
          crypto.randomUUID(),
          l.id,
          id,
          -l.quantity,
          "Order reservation",
          now,
        ),
    );
  }
  if (coupon) {
    sql.push(
      db
        .prepare(
          "UPDATE coupons SET remaining=CASE WHEN active=1 AND expires_at>? AND value=? AND minimum=? AND maximum=? AND kind=? THEN remaining-1 ELSE -1 END WHERE code=?",
        )
        .bind(
          now,
          coupon.value,
          coupon.minimum,
          coupon.maximum,
          coupon.kind,
          coupon.code,
        ),
    );
    sql.push(
      db
        .prepare("INSERT INTO coupon_uses VALUES (?,?,?,?)")
        .bind(crypto.randomUUID(), coupon.code, user.id, id),
    );
  }
  sql.push(
    db
      .prepare("INSERT INTO notifications VALUES (?,?,?,?,0,?)")
      .bind(
        crypto.randomUUID(),
        user.id,
        "Your order " + reference + " was placed",
        "/account/orders/" + reference,
        now,
      ),
  );
  try {
    await db.batch(sql);
  } catch {
    const duplicate = await db
      .prepare("SELECT * FROM orders WHERE user_id=? AND idempotency_key=?")
      .bind(user.id, v.idempotencyKey)
      .first<{ data: string }>();
    if (duplicate && JSON.parse(duplicate.data).fingerprint === fingerprint)
      return duplicate;
    throw new HttpError(
      409,
      "Stock, price or coupon availability changed. Review your cart and try again.",
    );
  }
  return db.prepare("SELECT * FROM orders WHERE id=?").bind(id).first();
}
export async function cancelOrder(
  id: string,
  userId: string,
  reason = "Cancelled by customer",
) {
  if (!(await releaseOrder(database(), id, userId, reason)))
    throw new HttpError(
      409,
      "Order cannot be cancelled at this stage, or was already cancelled.",
    );
}
