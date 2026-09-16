import { database, settingsValue, config } from "./database";
import { checkoutSchema, calculateTotal } from "./commerce";
import { HttpError } from "./security";
import type { User, Product } from "./types";
export async function createOrder(user: User, payload: unknown) {
  const v = checkoutSchema.parse(payload);
  const db = database();
  const old = await db
    .prepare("SELECT * FROM orders WHERE user_id=? AND idempotency_key=?")
    .bind(user.id, v.idempotencyKey)
    .first();
  if (old) return old;
  if (config("COMMERCE_ENABLED") !== "true")
    throw new HttpError(
      503,
      "Checkout is not open yet. INShop is currently displaying a sample catalog.",
    );
  const settings = await settingsValue();
  if (v.method === "cod" && !settings.codEnabled)
    throw new HttpError(400, "Cash on delivery is unavailable.");
  if (
    v.method === "razorpay" &&
    (!config("RAZORPAY_KEY_ID") || !config("RAZORPAY_KEY_SECRET"))
  )
    throw new HttpError(503, "Online payments have not been connected.");
  const grouped = new Map<
    string,
    { id: string; quantity: number; variant: string }
  >();
  for (const line of v.items) {
    if (line.variant !== "standard")
      throw new HttpError(400, "Choose a valid variant.");
    const prior = grouped.get(line.id);
    grouped.set(line.id, {
      ...line,
      quantity: (prior?.quantity ?? 0) + line.quantity,
    });
  }
  const lines = [];
  for (const line of grouped.values()) {
    if (line.quantity > 10)
      throw new HttpError(400, "Limit of 10 units per product.");
    const row = await db
      .prepare("SELECT * FROM products WHERE id=? AND status='active'")
      .bind(line.id)
      .first<{ id: string; price: number; stock: number; data: string }>();
    if (!row || row.stock < line.quantity)
      throw new HttpError(
        409,
        "An item is no longer available in the requested quantity.",
      );
    const p = JSON.parse(row.data) as Product;
    if (p.demo)
      throw new HttpError(
        400,
        "Sample products cannot be purchased. Add your real inventory before opening checkout.",
      );
    lines.push({
      ...line,
      price: row.price,
      title: p.title,
      image: p.thumbnail,
      seller: p.seller,
    });
  }
  let coupon = null;
  if (v.coupon) {
    coupon = await db
      .prepare(
        "SELECT * FROM coupons WHERE code=? AND active=1 AND remaining>0 AND expires_at>?",
      )
      .bind(v.coupon.toUpperCase(), Date.now())
      .first<{
        code: string;
        kind: string;
        value: number;
        minimum: number;
        maximum: number;
      }>();
    if (!coupon) throw new HttpError(400, "This coupon is invalid or expired.");
    if (
      await db
        .prepare("SELECT id FROM coupon_uses WHERE user_id=? AND code=?")
        .bind(user.id, coupon.code)
        .first()
    )
      throw new HttpError(400, "You have already used this coupon.");
  }
  const totals = calculateTotal(
    lines,
    coupon ?? undefined,
    settings.shippingFee,
    settings.freeOver,
  );
  if (coupon && totals.subtotal < coupon.minimum)
    throw new HttpError(400, "Your order does not meet this coupon’s minimum.");
  const id = crypto.randomUUID(),
    reference =
      "INS-26-" +
      crypto.randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase(),
    now = Date.now();
  const data = {
    address: v.address,
    items: lines,
    totals,
    history: [{ status: "placed", at: now }],
    coupon: coupon?.code ?? null,
  };
  const sql = [
    db
      .prepare(
        "INSERT INTO orders (id,reference,user_id,idempotency_key,status,payment_status,method,total,data,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        id,
        reference,
        user.id,
        v.idempotencyKey,
        "placed",
        v.method === "cod" ? "due" : "pending",
        v.method,
        totals.total,
        JSON.stringify(data),
        now,
      ),
  ];
  for (const l of lines) {
    sql.push(
      db
        .prepare(
          "UPDATE products SET stock=CASE WHEN price=? AND status='active' THEN stock-? ELSE -1 END WHERE id=?",
        )
        .bind(l.price, l.quantity, l.id),
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
        .prepare("UPDATE coupons SET remaining=remaining-1 WHERE code=?")
        .bind(coupon.code),
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
      .first();
    if (duplicate) return duplicate;
    throw new HttpError(
      409,
      "Stock or coupon availability changed. Please review your cart and try again.",
    );
  }
  return await db.prepare("SELECT * FROM orders WHERE id=?").bind(id).first();
}
export async function cancelOrder(id: string, userId: string) {
  const db = database();
  const order = await db
    .prepare("SELECT * FROM orders WHERE id=? AND user_id=?")
    .bind(id, userId)
    .first<{ status: string; payment_status: string; data: string }>();
  if (!order) throw new HttpError(404, "Order not found");
  if (!["placed", "processing"].includes(order.status))
    throw new HttpError(409, "This order cannot be cancelled at this stage.");
  if (order.payment_status === "paid")
    throw new HttpError(
      409,
      "Please request cancellation through support so your refund can be verified.",
    );
  const items = await db
    .prepare("SELECT product_id,quantity FROM order_items WHERE order_id=?")
    .bind(id)
    .all<{ product_id: string; quantity: number }>();
  await db.batch([
    ...items.results.map((l) =>
      db
        .prepare(
          "UPDATE products SET stock=stock+? WHERE id=? AND EXISTS (SELECT 1 FROM orders WHERE id=? AND status IN ('placed','processing') AND payment_status!='paid')",
        )
        .bind(l.quantity, l.product_id, id),
    ),
    db
      .prepare(
        "UPDATE orders SET status='cancelled' WHERE id=? AND status IN ('placed','processing') AND payment_status!='paid'",
      )
      .bind(id),
  ]);
}
