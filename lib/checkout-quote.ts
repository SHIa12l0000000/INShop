import { z } from "zod";
import { cartSchema, calculateTotal } from "./commerce";
import { database, settingsValue } from "./database";
import { HttpError } from "./errors";
import type { Product } from "./types";

export const quoteSchema = z.object({
  items: cartSchema,
  coupon: z.string().max(30).default(""),
  pin: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
});
export async function checkoutQuote(
  payload: unknown,
  userId?: string,
  purchasable = false,
) {
  const v = quoteSchema.parse(payload),
    db = database(),
    settings = await settingsValue();
  const grouped = new Map<
    string,
    { id: string; variant: string; quantity: number }
  >();
  for (const line of v.items) {
    if (line.variant !== "standard")
      throw new HttpError(400, "This variant is unavailable.");
    const quantity = (grouped.get(line.id)?.quantity ?? 0) + line.quantity;
    if (quantity > 10)
      throw new HttpError(400, "Limit of 10 units per product.");
    grouped.set(line.id, { ...line, quantity });
  }
  const lines = [];
  for (const line of grouped.values()) {
    const row = await db
      .prepare(
        "SELECT id,title,price,stock,data FROM products WHERE id=? AND status='active'",
      )
      .bind(line.id)
      .first<{
        id: string;
        title: string;
        price: number;
        stock: number;
        data: string;
      }>();
    if (!row || row.stock < line.quantity)
      throw new HttpError(
        409,
        "An item is unavailable in the requested quantity. Review your cart.",
      );
    const p = JSON.parse(row.data) as Product;
    if (purchasable && p.demo)
      throw new HttpError(
        400,
        "Sample products cannot be purchased. The owner must add real inventory.",
      );
    lines.push({
      ...line,
      price: row.price,
      title: row.title,
      image: p.thumbnail,
      seller: p.seller,
    });
  }
  if (
    v.pin &&
    Array.isArray(settings.deliveryPins) &&
    settings.deliveryPins.length &&
    !settings.deliveryPins.includes(v.pin)
  )
    throw new HttpError(400, "Delivery is not available to this PIN code.");
  let coupon = null;
  if (v.coupon.trim()) {
    coupon = await db
      .prepare(
        "SELECT * FROM coupons WHERE code=? AND active=1 AND remaining>0 AND expires_at>?",
      )
      .bind(v.coupon.trim().toUpperCase(), Date.now())
      .first<{
        code: string;
        kind: string;
        value: number;
        minimum: number;
        maximum: number;
        expires_at: number;
      }>();
    if (!coupon) throw new HttpError(400, "This coupon is invalid or expired.");
    if (
      userId &&
      (await db
        .prepare("SELECT id FROM coupon_uses WHERE user_id=? AND code=?")
        .bind(userId, coupon.code)
        .first())
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
    throw new HttpError(
      400,
      `This coupon requires a subtotal of ₹${(coupon.minimum / 100).toLocaleString("en-IN")}.`,
    );
  return { lines, totals, coupon, settings };
}
