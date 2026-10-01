import { config, database } from "../../../../lib/database";
import { errorResponse, HttpError } from "../../../../lib/security";
import { expireReservations } from "../../../../lib/order-lifecycle";
export async function POST(req: Request) {
  try {
    const configured = config("MAINTENANCE_SECRET");
    if (configured.length < 32)
      throw new HttpError(503, "Maintenance is not configured.");
    const provided = req.headers.get("authorization") ?? "";
    const hash = async (s: string) =>
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
      );
    const [a, b] = await Promise.all([
      hash(provided),
      hash("Bearer " + configured),
    ]);
    let difference = 0;
    for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
    if (difference) throw new HttpError(401, "Unauthorized");
    const expired = await expireReservations(database());
    await database()
      .prepare("DELETE FROM rate_limits WHERE window<?")
      .bind(Math.floor(Date.now() / 60000) - 1440)
      .run();
    return Response.json({ expired });
  } catch (e) {
    return errorResponse(e);
  }
}
