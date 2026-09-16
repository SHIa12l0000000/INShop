import { authClient } from "../../../lib/auth";
import { config } from "../../../lib/database";
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next =
    url.searchParams.get("next") === "/account/security"
      ? "/account/security"
      : "/account";
  if (code) {
    try {
      const client = await authClient();
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (!error) return Response.redirect(config("APP_URL") + next, 302);
    } catch {}
  }
  return Response.redirect(
    config("APP_URL") + "/login?error=verification",
    302,
  );
}
