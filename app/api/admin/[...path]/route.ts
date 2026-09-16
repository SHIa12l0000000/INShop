import { z } from "zod";
import { requireUser } from "../../../../lib/auth";
import { database, initialize, audit } from "../../../../lib/database";
import {
  jsonBody,
  sameOrigin,
  rateLimit,
  errorResponse,
  HttpError,
} from "../../../../lib/security";
import { canTransition } from "../../../../lib/commerce";
const tableMap: Record<string, string> = {
  products: "products",
  inventory: "products",
  orders: "orders",
  customers: "users",
  reviews: "reviews",
  questions: "questions",
  coupons: "coupons",
  returns: "returns",
  refunds: "refunds",
  support: "tickets",
  sellers: "sellers",
  payments: "orders",
  logs: "admin_logs",
  security: "admin_logs",
  notifications: "notifications",
  admins: "users",
};
const kinds = ["categories", "brands", "promotions", "banners", "homepage"];
export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    await initialize();
    await requireUser(true);
    const { path } = await params;
    const [resource] = path;
    const db = database();
    if (
      resource === "dashboard" ||
      resource === "analytics" ||
      resource === "reports"
    ) {
      const stats = await db
        .prepare(
          "SELECT COUNT(*) orders,COALESCE(SUM(CASE WHEN payment_status='paid' THEN total ELSE 0 END),0) revenue,COALESCE(AVG(total),0) aov FROM orders",
        )
        .first();
      const customers = await db
        .prepare("SELECT COUNT(*) count FROM users")
        .first();
      const products = await db
        .prepare(
          "SELECT COUNT(*) count,SUM(CASE WHEN stock<10 THEN 1 ELSE 0 END) low FROM products",
        )
        .first();
      const recent = await db
        .prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 10")
        .all();
      const trend = await db
        .prepare(
          "SELECT date(created_at/1000,'unixepoch') day,SUM(total) total FROM orders WHERE payment_status='paid' GROUP BY day ORDER BY day DESC LIMIT 30",
        )
        .all();
      return Response.json({
        stats,
        customers,
        products,
        recent: recent.results,
        trend: trend.results,
      });
    }
    let rows;
    if (resource === "settings")
      rows = await db.prepare("SELECT * FROM settings").all();
    else if (kinds.includes(resource))
      rows = await db
        .prepare("SELECT * FROM content WHERE kind=? ORDER BY position")
        .bind(resource)
        .all();
    else if (tableMap[resource])
      rows = await db
        .prepare("SELECT * FROM " + tableMap[resource] + " LIMIT 500")
        .all();
    else throw new HttpError(404, "Section not found");
    return Response.json(
      { rows: rows.results },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    sameOrigin(req);
    await rateLimit(req, "admin", 40);
    const u = await requireUser(true);
    const { path } = await params;
    const [resource, id, action] = path;
    const b = await jsonBody(req);
    const db = database();
    if (resource === "products") {
      if (action === "archive") {
        await db
          .prepare(
            "UPDATE products SET status='archived',updated_at=? WHERE id=?",
          )
          .bind(Date.now(), id)
          .run();
      } else {
        const v = z
          .object({
            title: z.string().min(3).max(200),
            slug: z.string().regex(/^[a-z0-9-]+$/),
            brand: z.string().min(1).max(100),
            category: z.string().min(1).max(80),
            price: z.number().int().positive(),
            mrp: z.number().int().positive(),
            stock: z.number().int().min(0).max(100000),
            description: z.string().min(10).max(10000),
            thumbnail: z.string().url().startsWith("https://"),
            status: z.enum(["active", "draft", "archived"]),
            sku: z.string().min(1).max(100),
            demo: z.boolean().default(false),
          })
          .parse(b);
        if (v.mrp < v.price)
          throw new HttpError(400, "MRP must be at least the selling price.");
        const pid = id ?? crypto.randomUUID();
        const data = {
          ...v,
          id: pid,
          images: [v.thumbnail],
          categorySlug: v.category.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          rating: 0,
          reviews: 0,
          discount: Math.round((1 - v.price / v.mrp) * 100),
          specs: { Brand: v.brand },
          tags: [],
          variants: [{ id: "standard", label: "Standard", delta: 0 }],
          seller: "INShop",
        };
        await db.batch([
          db
            .prepare(
              "INSERT INTO products VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET slug=excluded.slug,title=excluded.title,brand=excluded.brand,category=excluded.category,price=excluded.price,mrp=excluded.mrp,stock=excluded.stock,status=excluded.status,data=excluded.data,updated_at=excluded.updated_at",
            )
            .bind(
              pid,
              v.slug,
              v.title,
              v.brand,
              v.category,
              v.price,
              v.mrp,
              v.stock,
              v.status,
              JSON.stringify(data),
              Date.now(),
            ),
          db
            .prepare("INSERT INTO price_history VALUES (?,?,?,?)")
            .bind(crypto.randomUUID(), pid, v.price, Date.now()),
        ]);
      }
    } else if (resource === "inventory") {
      const v = z
        .object({ stock: z.number().int().min(0).max(100000) })
        .parse(b);
      await db.batch([
        db
          .prepare(
            "INSERT INTO inventory_transactions SELECT ?,id,NULL,?-stock,?,? FROM products WHERE id=?",
          )
          .bind(
            crypto.randomUUID(),
            v.stock,
            "Admin stock adjustment",
            Date.now(),
            id,
          ),
        db
          .prepare("UPDATE products SET stock=?,updated_at=? WHERE id=?")
          .bind(v.stock, Date.now(), id),
      ]);
    } else if (resource === "orders") {
      const v = z
        .object({
          status: z.string(),
          tracking: z.string().max(100).optional(),
          courier: z.string().max(100).optional(),
        })
        .parse(b);
      const o = await db
        .prepare("SELECT status,data FROM orders WHERE id=?")
        .bind(id)
        .first<{ status: string; data: string }>();
      if (
        !o ||
        !canTransition(o.status, v.status) ||
        ["cancelled", "refunded", "returned"].includes(v.status)
      )
        throw new HttpError(
          409,
          "This order transition requires a separate verified stock or refund operation.",
        );
      const data = JSON.parse(o.data);
      data.history.push({ status: v.status, at: Date.now() });
      if (v.tracking) data.tracking = v.tracking;
      if (v.courier) data.courier = v.courier;
      await db
        .prepare("UPDATE orders SET status=?,data=? WHERE id=? AND status=?")
        .bind(v.status, JSON.stringify(data), id, o.status)
        .run();
    } else if (resource === "customers") {
      const v = z.object({ status: z.enum(["active", "suspended"]) }).parse(b);
      if (id === u.id)
        throw new HttpError(400, "You cannot suspend your own account.");
      await db
        .prepare("UPDATE users SET status=? WHERE id=? AND role!='admin'")
        .bind(v.status, id)
        .run();
    } else if (resource === "reviews") {
      const v = z.object({ status: z.enum(["published", "hidden"]) }).parse(b);
      await db
        .prepare("UPDATE reviews SET status=? WHERE id=?")
        .bind(v.status, id)
        .run();
    } else if (resource === "questions") {
      const v = z.object({ answer: z.string().min(2).max(2000) }).parse(b);
      await db
        .prepare("UPDATE questions SET answer=? WHERE id=?")
        .bind(v.answer, id)
        .run();
    } else if (resource === "support") {
      const v = z
        .object({
          message: z.string().min(2).max(5000),
          status: z.enum(["open", "pending", "resolved"]),
        })
        .parse(b);
      const ticket = await db
        .prepare("SELECT messages FROM tickets WHERE id=?")
        .bind(id)
        .first<{ messages: string }>();
      if (!ticket) throw new HttpError(404, "Ticket not found");
      await db
        .prepare("UPDATE tickets SET messages=?,status=? WHERE id=?")
        .bind(
          JSON.stringify([
            ...JSON.parse(ticket.messages),
            { from: "INShop support", body: v.message, at: Date.now() },
          ]),
          v.status,
          id,
        )
        .run();
    } else if (resource === "coupons") {
      const v = z
        .object({
          code: z.string().regex(/^[A-Z0-9]{3,20}$/),
          kind: z.enum(["percent", "fixed"]),
          value: z.number().int().positive(),
          minimum: z.number().int().min(0),
          maximum: z.number().int().positive(),
          remaining: z.number().int().min(0),
          expiresAt: z.number().int().positive(),
          active: z.boolean(),
        })
        .parse(b);
      if (v.kind === "percent" && v.value > 100)
        throw new HttpError(400, "Percentage cannot exceed 100");
      await db
        .prepare(
          "INSERT INTO coupons VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(code) DO UPDATE SET kind=excluded.kind,value=excluded.value,minimum=excluded.minimum,maximum=excluded.maximum,remaining=excluded.remaining,expires_at=excluded.expires_at,active=excluded.active",
        )
        .bind(
          v.code,
          v.kind,
          v.value,
          v.minimum,
          v.maximum,
          v.remaining,
          v.expiresAt,
          Number(v.active),
        )
        .run();
    } else if (resource === "settings") {
      const v = z
        .object({
          name: z.string().min(2).max(80),
          shippingFee: z.number().int().min(0),
          freeOver: z.number().int().min(0),
          codEnabled: z.boolean(),
          membershipEnabled: z.boolean().default(false),
          sellerRegistration: z.boolean().default(false),
          taxIncluded: z.boolean().default(true),
        })
        .parse(b);
      await db
        .prepare("UPDATE settings SET value=? WHERE key='store'")
        .bind(JSON.stringify(v))
        .run();
    } else if (kinds.includes(resource)) {
      const v = z
        .object({
          title: z.string().min(2).max(200),
          position: z.number().int().min(0),
          active: z.boolean(),
          data: z.record(z.unknown()),
        })
        .parse(b);
      if (
        v.data.href &&
        (!String(v.data.href).startsWith("/") ||
          String(v.data.href).startsWith("//"))
      )
        throw new HttpError(400, "Destination must be a local path");
      await db
        .prepare(
          "INSERT INTO content VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,data=excluded.data,position=excluded.position,active=excluded.active",
        )
        .bind(
          id ?? crypto.randomUUID(),
          resource,
          v.title,
          JSON.stringify(v.data),
          v.position,
          Number(v.active),
        )
        .run();
    } else throw new HttpError(404, "Unsupported action");
    await audit(u.id, action ?? "save", resource + "/" + (id ?? "new"));
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
