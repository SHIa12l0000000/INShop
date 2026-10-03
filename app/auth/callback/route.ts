import {
  authClient,
  authDestination,
  clearSiteSession,
} from "../../../lib/auth";
import { config } from "../../../lib/database";
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = authDestination(url.searchParams.get("next"));
  if (code) {
    try {
      const client = await authClient();
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (!error) {
        await clearSiteSession();
        return Response.redirect(config("APP_URL") + next, 302);
      }
    } catch {}
  }
  return Response.redirect(
    config("APP_URL") + "/login?error=verification",
    302,
  );
}
