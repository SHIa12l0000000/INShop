import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { config, database } from "./database";
import { HttpError } from "./security";
import { hasAdminAccess } from "./policies";
export const authConfigured = () =>
  !!(
    config("SUPABASE_URL") &&
    config("SUPABASE_ANON_KEY") &&
    /^https:\/\//.test(config("APP_URL"))
  );
export async function authClient() {
  if (!authConfigured())
    throw new HttpError(
      503,
      "Sign-in is not available yet. The store owner needs to connect authentication. You can continue browsing as a guest.",
    );
  const store = await cookies();
  return createServerClient(
    config("SUPABASE_URL"),
    config("SUPABASE_ANON_KEY"),
    {
      cookieOptions: {
        httpOnly: true,
        secure: config("APP_URL").startsWith("https"),
        sameSite: "lax",
        path: "/",
      },
      cookies: {
        getAll: () => store.getAll(),
        setAll: (items) => {
          for (const c of items) store.set(c.name, c.value, c.options);
        },
      },
    },
  );
}
export async function currentUser() {
  if (!authConfigured()) return null;
  const client = await authClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user || !user.email_confirmed_at) return null;
  const db = database();
  await db
    .prepare(
      "INSERT INTO users (id,email,name,role,status,created_at,last_login_at) VALUES (?,?,?,'customer','active',?,?) ON CONFLICT(id) DO UPDATE SET last_login_at=excluded.last_login_at",
    )
    .bind(
      user.id,
      user.email ?? "",
      user.user_metadata?.full_name ?? user.email?.split("@")[0] ?? "Customer",
      Date.now(),
      Date.now(),
    )
    .run();
  const row = await db
    .prepare("SELECT id,email,name,role,status FROM users WHERE id=?")
    .bind(user.id)
    .first<{
      id: string;
      email: string;
      name: string;
      role: string;
      status: string;
    }>();
  return row?.status === "active" ? row : null;
}
export async function requireUser(admin = false) {
  const u = await currentUser();
  if (!u) throw new HttpError(401, "Please sign in to continue.");
  if (admin) {
    if (u.role !== "admin")
      throw new HttpError(403, "Administrator access required.");
    const client = await authClient();
    const { data } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (!hasAdminAccess(u.role, data?.currentLevel ?? "aal1"))
      throw new HttpError(
        403,
        "Administrator two-factor verification required.",
      );
  }
  return u;
}
