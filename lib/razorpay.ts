import { config } from "./database";
import { HttpError } from "./errors";

export async function razorpay<T>(
  path: string,
  method = "GET",
  body?: unknown,
  idempotency?: string,
): Promise<T> {
  const key = config("RAZORPAY_KEY_ID"),
    secret = config("RAZORPAY_KEY_SECRET");
  if (!key || !secret)
    throw new HttpError(503, "Payment provider is not configured.");
  const response = await fetch("https://api.razorpay.com/v1" + path, {
    method,
    signal: AbortSignal.timeout(12000),
    headers: {
      Authorization: "Basic " + btoa(key + ":" + secret),
      "Content-Type": "application/json",
      ...(idempotency ? { "X-Refund-Idempotency": idempotency } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok)
    throw new HttpError(
      502,
      "The payment provider did not confirm this request. Check its status before retrying.",
    );
  return response.json() as Promise<T>;
}
