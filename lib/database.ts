import { env } from "cloudflare:workers";
import seed from "./catalog.json";
import type { Product } from "./types";
export const config = (key: string) =>
  String(
    (env as unknown as Record<string, unknown>)[key] ?? process.env[key] ?? "",
  );
export function database() {
  const db = (env as unknown as { DB: D1Database }).DB;
  if (!db) throw new Error("Storage unavailable");
  return db;
}
export async function initialize() {
  const db = database();
  if (
    await db
      .prepare("SELECT key FROM settings WHERE key='catalog_seed_v2'")
      .first()
  )
    return;
  const statements = seed.map((p) =>
    db
      .prepare(
        "INSERT OR IGNORE INTO products (id,slug,title,brand,category,price,mrp,stock,status,data,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        p.id,
        p.slug,
        p.title,
        p.brand,
        p.category,
        p.price,
        p.mrp,
        p.stock,
        "active",
        JSON.stringify(p),
        Date.now(),
      ),
  );
  for (let i = 0; i < statements.length; i += 30)
    await db.batch(statements.slice(i, i + 30));
  await db.batch([
    db
      .prepare(
        "INSERT OR IGNORE INTO coupons VALUES ('WELCOME10','percent',10,99900,100000,500,?,1)",
      )
      .bind(Date.now() + 365 * 86400000),
    db
      .prepare(
        "INSERT OR IGNORE INTO content VALUES ('hero-main','banners','Good finds. Great everyday.',?,0,1)",
      )
      .bind(
        JSON.stringify({
          eyebrow: "THE EVERYDAY UPGRADE",
          subtitle:
            "Little upgrades. Big possibilities. Discover more of what you love, for less.",
          cta: "Explore the deals",
          href: "/deals",
          image: seed.find((p) => p.id === "prd-101")?.images[0],
        }),
      ),
    db
      .prepare("INSERT OR IGNORE INTO settings VALUES ('store',?)")
      .bind(
        JSON.stringify({
          name: "INShop",
          shippingFee: 4900,
          freeOver: 99900,
          codEnabled: false,
          membershipEnabled: false,
          sellerRegistration: false,
          taxIncluded: true,
        }),
      ),
    db.prepare(
      "INSERT OR IGNORE INTO settings VALUES ('catalog_seed_v2','true')",
    ),
  ]);
}
export function rowProduct(r: Record<string, unknown>): Product {
  return {
    ...JSON.parse(r.data as string),
    id: r.id,
    slug: r.slug,
    title: r.title,
    brand: r.brand,
    category: r.category,
    price: r.price,
    mrp: r.mrp,
    stock: r.stock,
    status: r.status,
  } as Product;
}
export async function allProducts() {
  await initialize();
  const r = await database()
    .prepare(
      "SELECT * FROM products WHERE status='active' ORDER BY updated_at DESC LIMIT 240",
    )
    .all();
  return r.results.map(rowProduct);
}
export async function settingsValue() {
  const r = await database()
    .prepare("SELECT value FROM settings WHERE key='store'")
    .first<{ value: string }>();
  return r
    ? JSON.parse(r.value)
    : { shippingFee: 4900, freeOver: 99900, codEnabled: false };
}
export async function audit(
  admin: string,
  action: string,
  resource: string,
  metadata: unknown = {},
) {
  await database()
    .prepare("INSERT INTO admin_logs VALUES (?,?,?,?,?,?)")
    .bind(
      crypto.randomUUID(),
      admin,
      action,
      resource,
      JSON.stringify(metadata),
      Date.now(),
    )
    .run();
}
