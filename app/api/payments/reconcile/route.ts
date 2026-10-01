import { requireUser } from "../../../../lib/auth";
import { database } from "../../../../lib/database";
import {
  sameOrigin,
  rateLimit,
  jsonBody,
  errorResponse,
  HttpError,
} from "../../../../lib/security";
import {
  recordCapture,
  type CapturedPayment,
} from "../../../../lib/order-lifecycle";
import { razorpay } from "../../../../lib/razorpay";
import { z } from "zod";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await rateLimit(req, "payment-reconcile", 10);
    const u = await requireUser();
    const { orderId } = z
      .object({ orderId: z.string().uuid() })
      .parse(await jsonBody(req));
    const db = database(),
      o = await db
        .prepare(
          "SELECT gateway_id,payment_status FROM orders WHERE id=? AND user_id=?",
        )
        .bind(orderId, u.id)
        .first<{ gateway_id: string; payment_status: string }>();
    if (!o?.gateway_id) throw new HttpError(404, "Payment not found.");
    if (o.payment_status === "pending") {
      const payments = await razorpay<{ items: CapturedPayment[] }>(
        `/orders/${encodeURIComponent(o.gateway_id)}/payments`,
      );
      const captured = payments.items.find(
        (p) => p.status === "captured" && p.captured !== false,
      );
      if (captured)
        await recordCapture(db, "reconcile_" + captured.id, captured);
    }
    return Response.json(
      await db
        .prepare(
          "SELECT reference,status,payment_status FROM orders WHERE id=? AND user_id=?",
        )
        .bind(orderId, u.id)
        .first(),
    );
  } catch (e) {
    return errorResponse(e);
  }
}
