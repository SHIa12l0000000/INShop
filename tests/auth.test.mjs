import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { build } from "esbuild";

// Execute the production handlers with real SQL. Only external provider,
// platform identity and request-cookie boundaries are replaced.
const mocks = {
  "next/headers":
    "export const cookies = async () => globalThis.__inshopAuthTest.cookies;",
  "@supabase/ssr":
    "export const createServerClient = () => globalThis.__inshopAuthTest.client;",
  "cloudflare:workers":
    "export const env = new Proxy({}, {get: (_, key) => globalThis.__inshopAuthTest.env[key]});",
  "chatgpt-auth":
    "export const getChatGPTUser = async () => globalThis.__inshopAuthTest.siteIdentity; export const chatGPTSignInPath = p => '/signin-with-chatgpt?return_to=' + encodeURIComponent(p);",
};
const bundle = await build({
  stdin: {
    contents: `export * from './lib/auth.ts';
      export {normalizeTotpQr} from './lib/mfa.ts';
      export {POST,GET} from './app/api/auth/[action]/route.ts';
      export {GET as callback} from './app/auth/callback/route.ts';`,
    resolveDir: process.cwd(),
    loader: "ts",
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  target: "node24",
  plugins: [
    {
      name: "test-boundaries",
      setup(b) {
        b.onResolve(
          {
            filter:
              /^(next\/headers|@supabase\/ssr|cloudflare:workers)$|chatgpt-auth$/,
          },
          (args) => ({
            path: args.path.endsWith("chatgpt-auth")
              ? "chatgpt-auth"
              : args.path,
            namespace: "fixture",
          }),
        );
        b.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
          contents: mocks[args.path],
          loader: "js",
        }));
      },
    },
  ],
});
const handlers = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64")
);
const origin = "https://inshop.example.test";
const userId = "11111111-1111-4111-8111-111111111111";
const authCookie = "sb-inshop-test-auth-token";
let f;
beforeEach(() => {
  const sql = new DatabaseSync(":memory:");
  for (const file of readdirSync("drizzle")
    .filter((x) => x.endsWith(".sql"))
    .sort())
    sql.exec(readFileSync("drizzle/" + file, "utf8"));
  sql.exec("INSERT INTO settings VALUES ('catalog_seed_v2','true')");
  const db = {
    async batch(statements) {
      sql.exec("BEGIN");
      try {
        const result = [];
        for (const statement of statements) result.push(await statement.run());
        sql.exec("COMMIT");
        return result;
      } catch (error) {
        sql.exec("ROLLBACK");
        throw error;
      }
    },
    prepare(query) {
      let args = [];
      const s = {
        bind(...values) {
          args = values;
          return s;
        },
        async first() {
          return sql.prepare(query).get(...args) ?? null;
        },
        async all() {
          return { results: sql.prepare(query).all(...args) };
        },
        async run() {
          return { meta: sql.prepare(query).run(...args) };
        },
      };
      return s;
    },
  };
  const jar = new Map();
  f = globalThis.__inshopAuthTest = {
    sql,
    jar,
    writes: [],
    calls: [],
    level: "aal1",
    factors: [],
    providerError: null,
    user: null,
    siteIdentity: {
      userId: "site-user",
      email: "site@example.test",
      fullName: "Site customer",
    },
    env: {
      DB: db,
      APP_URL: origin,
      SUPABASE_URL: "https://inshop-test.supabase.co",
      SUPABASE_ANON_KEY: "fixture-public-key",
      SITE_AUTH_ENABLED: "true",
      GOOGLE_AUTH_ENABLED: "true",
      EMAIL_DELIVERY_ENABLED: "true",
    },
    cookies: {
      get(name) {
        return jar.has(name) ? { name, value: jar.get(name) } : undefined;
      },
      getAll() {
        return [...jar].map(([name, value]) => ({ name, value }));
      },
      set(name, value, options) {
        f.writes.push({ name, value, options });
        if (options?.maxAge === 0) jar.delete(name);
        else jar.set(name, value);
      },
    },
  };
  function signIn() {
    if (f.providerError)
      return { data: { session: null, user: null }, error: f.providerError };
    f.user = {
      id: userId,
      email: "customer@example.test",
      email_confirmed_at: "2026-10-01",
      user_metadata: { full_name: "Customer" },
    };
    jar.set(authCookie, "fixture-session");
    return { data: { session: {}, user: f.user }, error: null };
  }
  f.client = {
    auth: {
      async signInWithPassword() {
        f.calls.push("password");
        return signIn();
      },
      async signUp() {
        f.calls.push("signup");
        return { data: { session: null, user: null }, error: null };
      },
      async resetPasswordForEmail() {
        f.calls.push("reset");
        return { data: {}, error: null };
      },
      async exchangeCodeForSession() {
        f.calls.push("exchange");
        return signIn();
      },
      async signOut(options) {
        f.calls.push({ signOut: options });
        f.user = null;
        return { error: f.providerError };
      },
      async signInWithOAuth(options) {
        f.calls.push({ oauth: options });
        return {
          data: { url: "https://accounts.google.com/o/oauth2/v2/auth" },
          error: null,
        };
      },
      async getUser() {
        return { data: { user: f.user }, error: null };
      },
      mfa: {
        async listFactors() {
          return {
            data: {
              all: f.factors,
              totp: f.factors.filter(
                (x) =>
                  x.status === "verified" &&
                  (!x.factor_type || x.factor_type === "totp"),
              ),
            },
            error: null,
          };
        },
        async unenroll({ factorId }) {
          f.calls.push({ unenroll: factorId });
          if (f.removeError) return { error: { message: "Could not remove" } };
          f.factors = f.factors.filter((x) => x.id !== factorId);
          return { data: {}, error: null };
        },
        async enroll(options) {
          f.calls.push({ enroll: options });
          return {
            data: {
              id: "new-factor",
              totp: {
                secret: "FIXTURE-NOT-A-LIVE-KEY",
                qr_code:
                  'data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg"><path fill="#000" d="M0 0h1v1z"/></svg>',
              },
            },
            error: null,
          };
        },
        async getAuthenticatorAssuranceLevel() {
          return { data: { currentLevel: f.level } };
        },
      },
    },
  };
});
afterEach(() => {
  f.sql.close();
  delete globalThis.__inshopAuthTest;
});
function post(action, body = {}) {
  return handlers.POST(
    new Request(origin + "/api/auth/" + action, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ action }) },
  );
}
function oauth(next = "") {
  return handlers.GET(
    new Request(origin + "/api/auth/google?next=" + encodeURIComponent(next)),
    { params: Promise.resolve({ action: "google" }) },
  );
}
const password = {
  email: "customer@example.test",
  password: "Fixture-password-1!",
};

test("successful password sign-in switches away from Sites; failed sign-in preserves the current account", async () => {
  f.jar.set("inshop-site-session", "1");
  f.providerError = { message: "Invalid credentials" };
  assert.equal((await post("login", password)).status, 400);
  assert.equal(f.jar.get("inshop-site-session"), "1");
  f.providerError = null;
  assert.equal((await post("login", password)).status, 200);
  assert.equal(f.jar.has("inshop-site-session"), false);
  assert.equal((await handlers.currentUser()).id, userId);
  assert.equal(
    f.sql.prepare("SELECT role FROM users WHERE id=?").get(userId).role,
    "customer",
  );
});
test("unverified signup does not replace an existing Sites session", async () => {
  f.jar.set("inshop-site-session", "1");
  const result = await post("register", {
    ...password,
    name: "Test customer",
    phone: "9876543210",
    agree: true,
  });
  assert.equal(result.status, 200);
  assert.equal(f.jar.get("inshop-site-session"), "1");
});
test("OAuth exchange clears Site selection only on success and returns to administrator sign-in", async () => {
  f.jar.set("inshop-site-session", "1");
  f.providerError = { message: "Expired code" };
  const request = new Request(
    origin + "/auth/callback?code=fixture-code&next=/admin/login",
  );
  assert.equal(
    (await handlers.callback(request)).headers.get("location"),
    origin + "/login?error=verification",
  );
  assert.equal(f.jar.get("inshop-site-session"), "1");
  f.providerError = null;
  assert.equal(
    (await handlers.callback(request)).headers.get("location"),
    origin + "/admin/login",
  );
  assert.equal(f.jar.has("inshop-site-session"), false);
});
test("logout clears both providers and chunked cookies without clearing another project", async () => {
  for (const key of [
    "inshop-site-session",
    authCookie + ".0",
    authCookie + ".1",
    authCookie + "-code-verifier",
  ])
    f.jar.set(key, "fixture");
  f.jar.set("sb-other-auth-token", "unrelated");
  f.providerError = { message: "Provider unavailable" };
  assert.equal((await post("logout")).status, 200);
  assert.deepEqual([...f.jar.keys()], ["sb-other-auth-token"]);
  assert.ok(f.calls.some((c) => c.signOut?.scope === "local"));
  assert.ok(
    f.writes.every(
      (w) =>
        w.options.httpOnly && w.options.secure && w.options.sameSite === "lax",
    ),
  );
});
test("Sites-only logout works without Supabase credentials", async () => {
  f.env.SUPABASE_ANON_KEY = "";
  f.jar.set("inshop-site-session", "1");
  assert.equal((await post("logout")).status, 200);
  assert.equal(f.jar.size, 0);
  assert.equal(f.calls.length, 0);
});
test("switching to Sites ends the previous local Supabase session", async () => {
  await post("login", password);
  const response = await handlers.GET(new Request(origin + "/api/auth/site"), {
    params: Promise.resolve({ action: "site" }),
  });
  assert.equal(response.status, 302);
  assert.equal(f.jar.get("inshop-site-session"), "1");
  assert.equal(f.jar.has(authCookie), false);
  assert.equal((await handlers.currentUser()).provider, "site");
});
test("same-email identities cannot inherit an existing administrator role", async () => {
  f.sql
    .prepare("INSERT INTO users VALUES (?,?,'Existing','admin','active',1,1)")
    .run("site:existing", "CUSTOMER@example.test");
  await post("login", password);
  await assert.rejects(handlers.currentUser(), (e) => e.status === 409);
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM users").get().n, 1);
  assert.equal(
    f.sql.prepare("SELECT id,role FROM users").get().id,
    "site:existing",
  );
});
test("admin authorization requires the stored role, Supabase identity and verified MFA", async () => {
  await post("login", password);
  await handlers.currentUser();
  f.level = "aal2";
  await assert.rejects(handlers.requireUser(true), (e) => e.status === 403);
  f.sql.prepare("UPDATE users SET role='admin' WHERE id=?").run(userId);
  f.level = "aal1";
  await assert.rejects(handlers.requireUser(true), (e) => e.status === 403);
  f.level = "aal2";
  assert.equal((await handlers.requireUser(true)).role, "admin");
  f.jar.set("inshop-site-session", "1");
  await handlers.currentUser();
  f.sql
    .prepare("UPDATE users SET role='admin' WHERE id=?")
    .run("site:site-user");
  await assert.rejects(handlers.requireUser(true), (e) => e.status === 403);
});
test("OAuth destinations are exact allowlisted paths and starting OAuth preserves the active session", async () => {
  f.jar.set("inshop-site-session", "1");
  await oauth("/admin/login");
  assert.equal(
    f.calls.at(-1).oauth.options.redirectTo,
    origin + "/auth/callback?next=/admin/login",
  );
  for (const next of [
    "https://attacker.test",
    "//attacker.test",
    "/admin/login?next=//attacker.test",
    "/account/../admin",
  ])
    assert.equal(handlers.authDestination(next), "/account");
  assert.equal(f.jar.get("inshop-site-session"), "1");
});
test("disabled Google and email delivery reject provider calls while password login remains available", async () => {
  f.env.GOOGLE_AUTH_ENABLED = "false";
  f.env.EMAIL_DELIVERY_ENABLED = "false";
  assert.equal((await oauth()).status, 503);
  assert.equal(
    (
      await post("register", {
        ...password,
        name: "Test",
        phone: "9876543210",
        agree: true,
      })
    ).status,
    503,
  );
  assert.equal(
    (await post("forgot-password", { email: password.email })).status,
    503,
  );
  assert.equal(f.calls.length, 0);
  assert.equal((await post("login", password)).status, 200);
});

function enableBootstrap() {
  f.env.ADMIN_BOOTSTRAP_USER_ID = userId;
  f.env.ADMIN_BOOTSTRAP_EMAIL = password.email;
}

test("TOTP QR encoding preserves SVG colours and produces no URL fragment", () => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg"><path fill="#000" d="M0 0h1v1z"/></svg>';
  for (const input of [
    svg,
    "data:image/svg+xml;utf-8," + svg,
    "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg),
  ]) {
    const result = handlers.normalizeTotpQr(input);
    assert.equal(new URL(result).hash, "");
    assert.equal(
      decodeURIComponent(result.slice(result.indexOf(",") + 1)),
      svg,
    );
  }
  assert.equal(handlers.normalizeTotpQr("https://external.example/qr.svg"), "");
  assert.equal(handlers.normalizeTotpQr("data:image/svg+xml,%not-encoded"), "");
});

test("MFA setup replaces only abandoned INShop factors and returns uncached manual setup data", async () => {
  await post("login", password);
  f.factors = [
    {
      id: "old-inshop",
      factor_type: "totp",
      status: "unverified",
      friendly_name: "INShop authenticator",
    },
    {
      id: "other-app",
      factor_type: "totp",
      status: "unverified",
      friendly_name: "Another app",
    },
  ];
  const response = await post("mfa-enroll");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /no-store/);
  const data = await response.json();
  assert.equal(data.totp.secret, "FIXTURE-NOT-A-LIVE-KEY");
  assert.equal(new URL(data.totp.qr_code).hash, "");
  assert.deepEqual(
    f.calls.filter((x) => x.unenroll),
    [{ unenroll: "old-inshop" }],
  );
  assert.equal(f.factors[0].id, "other-app");
  assert.equal(f.calls.find((x) => x.enroll).enroll.issuer, "INShop");
});

test("MFA enrollment never deletes a verified authenticator", async () => {
  await post("login", password);
  f.factors = [
    {
      id: "active-factor",
      factor_type: "totp",
      status: "verified",
      friendly_name: "INShop authenticator",
    },
  ];
  assert.equal((await post("mfa-enroll")).status, 409);
  assert.equal(
    f.calls.some((x) => x.unenroll || x.enroll),
    false,
  );
});

test("MFA setup denies anonymous and Sites sessions and stops if unfinished-factor cleanup fails", async () => {
  assert.equal((await post("mfa-enroll")).status, 401);
  f.jar.set("inshop-site-session", "1");
  assert.equal((await post("mfa-enroll")).status, 403);
  await post("login", password);
  f.factors = [
    {
      id: "old-inshop",
      factor_type: "totp",
      status: "unverified",
      friendly_name: "INShop authenticator",
    },
  ];
  f.removeError = true;
  assert.equal((await post("mfa-enroll")).status, 400);
  assert.equal(
    f.calls.some((x) => x.enroll),
    false,
  );
});

test("signed-in customers can list only their own verified factors before first-admin activation", async () => {
  enableBootstrap();
  await post("login", password);
  f.factors = [
    {
      id: "verified-factor",
      status: "verified",
      friendly_name: "My authenticator",
      secret: "must-not-return",
    },
    { id: "pending-factor", status: "unverified", friendly_name: "Pending" },
  ];
  const response = await post("factors");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    adminReady: false,
    factors: [{ id: "verified-factor", name: "My authenticator" }],
  });
  assert.equal((await handlers.currentUser()).role, "customer");
  await assert.rejects(handlers.requireUser(true), (e) => e.status === 403);
});

test("factor discovery rejects guests and Sites sessions", async () => {
  assert.equal((await post("factors")).status, 401);
  f.jar.set("inshop-site-session", "1");
  assert.equal((await post("factors")).status, 403);
});

test("admin login detects missing enrollment and recognizes a completed MFA session", async () => {
  enableBootstrap();
  await post("login", password);
  assert.deepEqual(await (await post("factors")).json(), {
    adminReady: false,
    factors: [],
  });
  f.level = "aal2";
  assert.equal((await (await post("factors")).json()).adminReady, true);
  assert.equal((await handlers.requireUser(true)).role, "admin");
});

test("bootstrap checks the current verified provider email rather than a stale stored email", async () => {
  enableBootstrap();
  await post("login", password);
  await handlers.currentUser();
  f.user.email = "changed@example.test";
  f.level = "aal2";
  assert.equal((await handlers.currentUser()).role, "customer");
  assert.equal(
    f.sql
      .prepare(
        "SELECT COUNT(*) AS n FROM settings WHERE key='security.first_admin'",
      )
      .get().n,
    0,
  );
});

test("first admin activation requires the exact confirmed identity and MFA", async () => {
  enableBootstrap();
  assert.equal(await handlers.currentUser(), null);
  await post("login", password);
  f.user.email_confirmed_at = null;
  assert.equal(await handlers.currentUser(), null);
  f.user.email_confirmed_at = "2026-10-01";
  assert.equal((await handlers.currentUser()).role, "customer");
  f.level = "aal2";
  f.env.ADMIN_BOOTSTRAP_USER_ID = "another-user";
  assert.equal((await handlers.currentUser()).role, "customer");
  f.env.ADMIN_BOOTSTRAP_USER_ID = userId;
  f.env.ADMIN_BOOTSTRAP_EMAIL = "another@example.test";
  assert.equal((await handlers.currentUser()).role, "customer");
  enableBootstrap();
  assert.equal((await handlers.requireUser(true)).role, "admin");
  assert.equal(
    f.sql
      .prepare(
        "SELECT COUNT(*) AS n FROM admin_logs WHERE action='admin.bootstrap'",
      )
      .get().n,
    1,
  );
});

test("first admin activation is consumed once and cannot undo later demotion", async () => {
  enableBootstrap();
  await post("login", password);
  f.level = "aal2";
  await handlers.currentUser();
  await handlers.currentUser();
  f.sql.prepare("UPDATE users SET role='customer' WHERE id=?").run(userId);
  assert.equal((await handlers.currentUser()).role, "customer");
  assert.equal(
    f.sql
      .prepare(
        "SELECT COUNT(*) AS n FROM admin_logs WHERE action='admin.bootstrap'",
      )
      .get().n,
    1,
  );
});

test("bootstrap cannot add an admin where an admin already exists or grant Site identities", async () => {
  enableBootstrap();
  await post("login", password);
  f.level = "aal2";
  f.sql
    .prepare(
      "INSERT INTO users VALUES ('existing-admin','owner@example.test','Owner','admin','active',1,1)",
    )
    .run();
  assert.equal((await handlers.currentUser()).role, "customer");
  assert.equal(
    f.sql
      .prepare(
        "SELECT COUNT(*) AS n FROM settings WHERE key='security.first_admin'",
      )
      .get().n,
    0,
  );
  f.jar.set("inshop-site-session", "1");
  f.env.ADMIN_BOOTSTRAP_USER_ID = "site:site-user";
  f.env.ADMIN_BOOTSTRAP_EMAIL = f.siteIdentity.email;
  assert.equal((await handlers.currentUser()).role, "customer");
});

test("admin activation rolls back the grant and marker if audit persistence fails", async () => {
  enableBootstrap();
  await post("login", password);
  f.level = "aal2";
  f.sql.exec(
    "CREATE TRIGGER fail_bootstrap_audit BEFORE INSERT ON admin_logs BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END",
  );
  await assert.rejects(handlers.currentUser(), /audit unavailable/);
  assert.equal(
    f.sql.prepare("SELECT role FROM users WHERE id=?").get(userId).role,
    "customer",
  );
  assert.equal(
    f.sql
      .prepare(
        "SELECT COUNT(*) AS n FROM settings WHERE key='security.first_admin'",
      )
      .get().n,
    0,
  );
});
