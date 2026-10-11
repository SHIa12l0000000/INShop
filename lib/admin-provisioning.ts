import { config, database } from "./database";

type Account = { id: string; email: string; role: string; status: string };

// Called only after Supabase getUser() verifies the identity and confirmed email.
// Owner-controlled configuration pins the first administrator to one identity.
export async function provisionFirstAdmin<T extends Account>(
  user: T,
  verifiedEmail: string | undefined,
  assurance: () => Promise<{
    data: { currentLevel: string | null } | null;
    error?: unknown;
  }>,
): Promise<T> {
  const id = config("ADMIN_BOOTSTRAP_USER_ID");
  const email = config("ADMIN_BOOTSTRAP_EMAIL");
  if (
    !id ||
    !email ||
    verifiedEmail?.toLowerCase() !== email.toLowerCase() ||
    user.id !== id ||
    user.email.toLowerCase() !== email.toLowerCase() ||
    user.role !== "customer" ||
    user.status !== "active"
  )
    return user;

  const level = await assurance();
  if (level.error || level.data?.currentLevel !== "aal2") return user;

  const db = database();
  const claim = crypto.randomUUID();
  const marker = JSON.stringify({ userId: id, claim, at: Date.now() });
  // D1 batch is transactional. A unique, durable claim prevents duplicate grants
  // and prevents configuration left behind from re-promoting a demoted user.
  await db.batch([
    db
      .prepare(
        "INSERT OR IGNORE INTO settings (key,value) SELECT 'security.first_admin',? FROM users WHERE id=? AND lower(email)=lower(?) AND role='customer' AND status='active' AND NOT EXISTS (SELECT 1 FROM users WHERE role='admin')",
      )
      .bind(marker, id, email),
    db
      .prepare(
        "UPDATE users SET role='admin' WHERE id=? AND lower(email)=lower(?) AND role='customer' AND status='active' AND EXISTS (SELECT 1 FROM settings WHERE key='security.first_admin' AND value=?)",
      )
      .bind(id, email, marker),
    db
      .prepare(
        "INSERT INTO admin_logs (id,admin_id,action,resource,metadata,created_at) SELECT ?,?,'admin.bootstrap',?,?,? WHERE EXISTS (SELECT 1 FROM settings WHERE key='security.first_admin' AND value=?) AND EXISTS (SELECT 1 FROM users WHERE id=? AND role='admin' AND status='active')",
      )
      .bind(
        claim,
        id,
        id,
        JSON.stringify({ method: "verified-supabase-mfa" }),
        Date.now(),
        marker,
        id,
      ),
  ]);
  const current = await db
    .prepare("SELECT role FROM users WHERE id=?")
    .bind(id)
    .first<{ role: string }>();
  return current?.role === "admin" ? { ...user, role: "admin" } : user;
}
