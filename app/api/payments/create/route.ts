import { requireUser } from "../../../../lib/auth";
import { config, database } from "../../../../lib/database";
import {
  sameOrigin,
  jsonBody,
  errorResponse,
  HttpError,
  rateLimit,
} from "../../../../lib/security";
import { z } from "zod";
import { expireReservations } from "../../../../lib/order-lifecycle";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await rateLimit(req, "payment-create", 5);
    const u = await requireUser();
    const { orderId } = z
      .object({ orderId: z.string().uuid() })
      .parse(await jsonBody(req));
    const db = database();
    await expireReservations(db);
    const o = await db
      .prepare(
        "SELECT * FROM orders WHERE id=? AND user_id=? AND method='razorpay' AND payment_status='pending' AND status='placed'",
      )
      .bind(orderId, u.id)
      .first<{
        id: string;
        reference: string;
        total: number;
        gateway_id: string | null;
      }>();
    if (!o) throw new HttpError(404, "Payable order not found");
    if (!config("RAZORPAY_KEY_SECRET"))
      throw new HttpError(503, "Payments unavailable");
    let gatewayId = o.gateway_id;
    if (!gatewayId) {
      const res = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: {
          Authorization:
            "Basic " +
            btoa(
              config("RAZORPAY_KEY_ID") + ":" + config("RAZORPAY_KEY_SECRET"),
            ),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: o.total,
          currency: "INR",
          receipt: o.reference,
          notes: { inshop_order: o.id },
        }),
      });
      if (!res.ok)
        throw new HttpError(
          502,
          "Payment provider could not create your payment. Please try again.",
        );
      const g = (await res.json()) as { id: string };
      await db
        .prepare(
          "UPDATE orders SET gateway_id=? WHERE id=? AND gateway_id IS NULL",
        )
        .bind(g.id, o.id)
        .run();
      gatewayId = (await db
        .prepare("SELECT gateway_id FROM orders WHERE id=?")
        .bind(o.id)
        .first<{ gateway_id: string }>())!.gateway_id;
    }
    return Response.json({
      key: config("RAZORPAY_KEY_ID"),
      order_id: gatewayId,
      amount: o.total,
      currency: "INR",
      name: "INShop",
    });
  } catch (e) {
    return errorResponse(e);
  }
}
