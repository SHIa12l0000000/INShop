import { database } from "./database";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin || origin !== new URL(req.url).origin)
    throw new HttpError(
      403,
      "This request could not be verified. Refresh the page and try again.",
    );
}
export async function rateLimit(req: Request, scope: string, max = 30) {
  const key = scope + ":" + (req.headers.get("cf-connecting-ip") ?? "local");
  const window = Math.floor(Date.now() / 60000);
  const r = await database()
    .prepare(
      "INSERT INTO rate_limits (key,count,window) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END, window=excluded.window RETURNING count",
    )
    .bind(key, window)
    .first<{ count: number }>();
  if ((r?.count ?? 0) > max)
    throw new HttpError(
      429,
      "Too many attempts. Please try again in a minute.",
    );
}
export async function jsonBody(req: Request) {
  if (Number(req.headers.get("content-length") ?? 0) > 100000)
    throw new HttpError(413, "Request is too large.");
  const text = await req.text();
  if (text.length > 100000) throw new HttpError(413, "Request is too large.");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "Please submit valid data.");
  }
}
export function errorResponse(e: unknown) {
  if (e instanceof HttpError)
    return Response.json({ error: e.message }, { status: e.status });
  if (e && typeof e === "object" && "issues" in e)
    return Response.json(
      {
        error: "Check the highlighted fields.",
        fields: (
          e as { issues: { path: unknown[]; message: string }[] }
        ).issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      },
      { status: 400 },
    );
  console.error(
    "INShop request failed",
    e instanceof Error ? e.name : "unknown",
  );
  return Response.json(
    { error: "Something didn’t load correctly. Please try again." },
    { status: 503 },
  );
}
