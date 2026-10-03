import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { config, database } from "./database";
import { HttpError } from "./security";
import { hasAdminAccess } from "./policies";
import { getChatGPTUser } from "../app/chatgpt-auth";
export const siteAuthConfigured = () => config("SITE_AUTH_ENABLED") === "true";
export const authConfigured = () =>
  !!(
    config("SUPABASE_URL") &&
    config("SUPABASE_ANON_KEY") &&
    /^https:\/\//.test(config("APP_URL"))
  );
export const googleAuthConfigured = () =>
  authConfigured() && config("GOOGLE_AUTH_ENABLED") === "true";
export const emailDeliveryConfigured = () =>
  authConfigured() && config("EMAIL_DELIVERY_ENABLED") === "true";

export function authDestination(value: string | null) {
  return ["/account", "/account/security", "/admin/login"].includes(value ?? "")
    ? value!
    : "/account";
}

export async function clearSiteSession() {
  (await cookies()).set("inshop-site-session", "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });
}

// Clear only this project's browser session, including chunked session cookies.
// This also signs the browser out when the provider cannot revoke a session.
export async function clearSupabaseCookies() {
  if (!config("SUPABASE_URL")) return;
  const prefix = `sb-${new URL(config("SUPABASE_URL")).hostname.split(".")[0]}-auth-token`;
  const store = await cookies();
  for (const { name } of store.getAll()) {
    if (
      name === prefix ||
      name.startsWith(prefix + ".") ||
      name === prefix + "-code-verifier" ||
      name.startsWith(prefix + "-code-verifier.")
    ) {
      store.set(name, "", {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 0,
        expires: new Date(0),
      });
    }
  }
}
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
  const cookieStore = await cookies();
  if (
    siteAuthConfigured() &&
    cookieStore.get("inshop-site-session")?.value === "1"
  ) {
    const identity = await getChatGPTUser();
    if (!identity) return null;
    const id = "site:" + identity.userId,
      db = database();
    const conflict = await db
      .prepare("SELECT id FROM users WHERE email=? AND id!=?")
      .bind(identity.email, id)
      .first();
    if (conflict)
      throw new HttpError(
        409,
        "This email already uses another sign-in method. Use that method to access your existing account.",
      );
    await db
      .prepare(
        "INSERT INTO users (id,email,name,role,status,created_at,last_login_at) VALUES (?,?,?,'customer','active',?,?) ON CONFLICT(id) DO UPDATE SET last_login_at=excluded.last_login_at",
      )
      .bind(
        id,
        identity.email,
        identity.fullName ?? identity.displayName,
        Date.now(),
        Date.now(),
      )
      .run();
    const user = await db
      .prepare("SELECT id,email,name,role,status FROM users WHERE id=?")
      .bind(id)
      .first<{
        id: string;
        email: string;
        name: string;
        role: string;
        status: string;
      }>();
    return user?.status === "active"
      ? { ...user, provider: "site" as const }
      : null;
  }
  if (!authConfigured()) return null;
  const client = await authClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user || !user.email_confirmed_at) return null;
  const db = database();
  const conflict = await db
    .prepare("SELECT id FROM users WHERE lower(email)=lower(?) AND id!=?")
    .bind(user.email ?? "", user.id)
    .first();
  if (conflict)
    throw new HttpError(
      409,
      "This email already uses another sign-in method. Use that method to access your existing account, or contact support to link your accounts.",
    );
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
  return row?.status === "active"
    ? { ...row, provider: "supabase" as const }
    : null;
}
export async function requireUser(admin = false) {
  const u = await currentUser();
  if (!u) throw new HttpError(401, "Please sign in to continue.");
  if (admin) {
    if (u.provider === "site")
      throw new HttpError(
        403,
        "Use the administrator sign-in method with two-factor authentication.",
      );
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
