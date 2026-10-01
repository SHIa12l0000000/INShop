import { z } from "zod";
export const cartSchema = z
  .array(
    z.object({
      id: z.string().min(1).max(100),
      variant: z.string().max(80).default("standard"),
      quantity: z.number().int().min(1).max(10),
    }),
  )
  .min(1)
  .max(50);
export const addressSchema = z.object({
  name: z.string().min(2).max(100),
  phone: z
    .string()
    .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number"),
  pin: z.string().regex(/^\d{6}$/, "Enter a 6-digit PIN code"),
  street: z.string().min(5).max(300),
  area: z.string().max(200).default(""),
  landmark: z.string().max(150).default(""),
  city: z.string().min(2).max(100),
  state: z.string().min(2).max(100),
  type: z.enum(["Home", "Work", "Other"]).default("Home"),
});
export const checkoutSchema = z.object({
  items: cartSchema,
  address: addressSchema,
  method: z.enum(["cod", "razorpay"]),
  coupon: z.string().max(30).default(""),
  idempotencyKey: z.string().uuid(),
  expectedTotal: z.number().int().nonnegative().optional(),
});
export function calculateTotal(
  lines: { price: number; quantity: number }[],
  coupon?: { kind: string; value: number; minimum: number; maximum: number },
  shippingFee = 4900,
  freeOver = 99900,
) {
  const subtotal = lines.reduce((s, l) => s + l.price * l.quantity, 0);
  const discount =
    coupon && subtotal >= coupon.minimum
      ? Math.min(
          subtotal,
          coupon.maximum,
          coupon.kind === "percent"
            ? Math.floor((subtotal * coupon.value) / 100)
            : coupon.value,
        )
      : 0;
  const shipping = subtotal >= freeOver ? 0 : shippingFee;
  return {
    subtotal,
    discount,
    shipping,
    total: subtotal - discount + shipping,
  };
}
export function canTransition(from: string, to: string) {
  return (
    (
      {
        placed: ["processing", "cancelled"],
        processing: ["packed", "cancelled"],
        packed: ["shipped"],
        shipped: ["out-for-delivery"],
        "out-for-delivery": ["delivered"],
        delivered: ["return-requested"],
        "return-requested": ["return-approved", "delivered"],
        "return-approved": ["returned"],
        returned: ["refunded"],
      } as Record<string, string[]>
    )[from]?.includes(to) ?? false
  );
}
