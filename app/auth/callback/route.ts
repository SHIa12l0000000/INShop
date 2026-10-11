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
  const providerError = url.searchParams.get("error");
  if (code && !providerError) {
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
    config("APP_URL") +
      (next === "/admin/login" ? "/admin/login" : "/login") +
      "?error=" +
      (providerError === "access_denied" ? "cancelled" : "verification"),
    302,
  );
}
