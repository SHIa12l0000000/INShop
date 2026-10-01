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
import {
  releaseOrder,
  transitionOrder,
  expireReservations,
} from "../../../../lib/order-lifecycle";
import {
  submitRefund,
  updateRefund,
  recordCodRefund,
  type GatewayRefund,
} from "../../../../lib/refund-lifecycle";
import { razorpay } from "../../../../lib/razorpay";
import { adjustStock } from "../../../../lib/inventory";
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
    if (["orders", "dashboard"].includes(resource))
      await expireReservations(db);
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
    else if (resource === "refunds")
      rows = await db
        .prepare(
          "SELECT r.*,o.method,o.reference AS order_reference FROM refunds r JOIN orders o ON o.id=r.order_id ORDER BY r.created_at DESC LIMIT 500",
        )
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
        const existing = id
          ? await db
              .prepare("SELECT data FROM products WHERE id=?")
              .bind(id)
              .first<{ data: string }>()
          : null;
        if (id && !existing) throw new HttpError(404, "Product not found.");
        const previous = existing ? JSON.parse(existing.data) : {};
        const data = {
          ...previous,
          ...v,
          id: pid,
          images:
            previous.thumbnail === v.thumbnail && previous.images?.length
              ? previous.images
              : [
                  v.thumbnail,
                  ...(previous.images ?? []).filter(
                    (url: string) => url !== v.thumbnail,
                  ),
                ].slice(0, 12),
          categorySlug: v.category.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          rating: previous.rating ?? 0,
          reviews: previous.reviews ?? 0,
          discount: Math.round((1 - v.price / v.mrp) * 100),
          specs: { ...previous.specs, Brand: v.brand },
          tags: previous.tags ?? [],
          variants: previous.variants ?? [
            { id: "standard", label: "Standard", delta: 0 },
          ],
          seller: previous.seller ?? "INShop",
        };
        await db.batch([
          db
            .prepare(
              "INSERT INTO products VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET slug=excluded.slug,title=excluded.title,brand=excluded.brand,category=excluded.category,price=excluded.price,mrp=excluded.mrp,status=excluded.status,data=excluded.data,updated_at=excluded.updated_at",
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
        .object({
          stock: z.number().int().min(0).max(100000),
          expectedStock: z.number().int().min(0).max(100000),
        })
        .parse(b);
      await adjustStock(db, id, v.stock, v.expectedStock);
    } else if (resource === "orders") {
      const v = z
        .object({
          status: z.string(),
          tracking: z.string().max(100).optional(),
          courier: z.string().max(100).optional(),
          reason: z.string().min(3).max(300).optional(),
          cashCollected: z.boolean().default(false),
        })
        .parse(b);
      if (v.status === "cancelled") {
        if (
          !(await releaseOrder(
            db,
            id,
            null,
            v.reason ?? "Cancelled by administrator",
          ))
        )
          throw new HttpError(409, "Order cannot be cancelled at this stage.");
      } else
        await transitionOrder(
          db,
          id,
          v.status,
          v.tracking,
          v.courier,
          v.cashCollected,
        );
    } else if (resource === "refunds") {
      if (action === "record-cod") {
        const v = z
          .object({
            reference: z.string().min(5).max(100),
            confirmed: z.literal(true),
          })
          .parse(b);
        await recordCodRefund(db, id, v.reference);
      } else if (action === "submit")
        await submitRefund(db, id, (payment, amount, key) =>
          razorpay<GatewayRefund>(
            "/payments/" + encodeURIComponent(payment) + "/refund",
            "POST",
            { amount, notes: { inshop_refund: id } },
            key,
          ),
        );
      else if (action === "reconcile") {
        const row = await db
          .prepare("SELECT gateway_id FROM refunds WHERE id=?")
          .bind(id)
          .first<{ gateway_id: string }>();
        if (!row?.gateway_id)
          throw new HttpError(
            409,
            "No gateway refund is recorded. Retry submission with its existing key.",
          );
        await updateRefund(
          db,
          id,
          await razorpay<GatewayRefund>(
            "/refunds/" + encodeURIComponent(row.gateway_id),
          ),
        );
      } else throw new HttpError(400, "Choose submit or reconcile.");
    } else if (resource === "returns") {
      const v = z
        .object({
          status: z.enum(["approved", "rejected", "received"]),
          restock: z.boolean().default(false),
        })
        .parse(b);
      const row = await db
        .prepare(
          "SELECT r.*,o.payment_status,o.method FROM returns r JOIN orders o ON o.id=r.order_id WHERE r.id=?",
        )
        .bind(id)
        .first<{
          order_id: string;
          status: string;
          payment_status: string;
          method: string;
          type: string;
        }>();
      if (!row) throw new HttpError(404, "Return not found.");
      if (row.type !== "Refund")
        throw new HttpError(
          409,
          "Replacement fulfillment is not configured. Resolve this request with the customer before processing.",
        );
      if (v.status === "received") {
        if (row.status !== "approved")
          throw new HttpError(409, "Only approved returns can be received.");
        const gate =
          "EXISTS(SELECT 1 FROM returns WHERE id=? AND status='approved')";
        const statements = [];
        if (v.restock) {
          statements.push(
            db
              .prepare(
                "INSERT INTO inventory_transactions SELECT lower(hex(randomblob(16))),product_id,order_id,quantity,?,? FROM order_items WHERE order_id=? AND " +
                  gate,
              )
              .bind("Inspected return restocked", Date.now(), row.order_id, id),
          );
          statements.push(
            db
              .prepare(
                "UPDATE products SET stock=stock+(SELECT SUM(quantity) FROM order_items WHERE order_id=? AND product_id=products.id) WHERE id IN (SELECT product_id FROM order_items WHERE order_id=?) AND " +
                  gate,
              )
              .bind(row.order_id, row.order_id, id),
          );
        }
        statements.push(
          db
            .prepare(
              "INSERT OR IGNORE INTO refunds (id,order_id,status,amount,created_at,updated_at) SELECT ?,id,'requested',total,?,? FROM orders WHERE id=? AND payment_status='paid' AND " +
                gate,
            )
            .bind(
              crypto.randomUUID(),
              Date.now(),
              Date.now(),
              row.order_id,
              id,
            ),
        );
        statements.push(
          db
            .prepare(
              "UPDATE orders SET status='returned',inventory_released=1,payment_status=CASE WHEN payment_status='paid' THEN 'refund-pending' ELSE payment_status END,data=json_insert(data,'$.history[#]',json(?)) WHERE id=? AND " +
                gate,
            )
            .bind(
              JSON.stringify({ status: "returned", at: Date.now() }),
              row.order_id,
              id,
            ),
        );
        statements.push(
          db
            .prepare(
              "UPDATE returns SET status='received' WHERE id=? AND status='approved'",
            )
            .bind(id),
        );
        await db.batch(statements);
      } else {
        if (row.status !== "requested")
          throw new HttpError(409, "This return has already been reviewed.");
        await db.batch([
          db
            .prepare(
              "UPDATE orders SET status=?,data=json_insert(data,'$.history[#]',json(?)) WHERE id=? AND EXISTS(SELECT 1 FROM returns WHERE id=? AND status='requested')",
            )
            .bind(
              v.status === "approved" ? "return-approved" : "delivered",
              JSON.stringify({ status: "return-" + v.status, at: Date.now() }),
              row.order_id,
              id,
            ),
          db
            .prepare(
              "UPDATE returns SET status=? WHERE id=? AND status='requested'",
            )
            .bind(v.status, id),
        ]);
      }
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
        .prepare(
          "UPDATE tickets SET messages=json_insert(messages,'$[#]',json(?)),status=? WHERE id=? RETURNING id",
        )
        .bind(
          JSON.stringify({
            from: "INShop support",
            body: v.message,
            at: Date.now(),
          }),
          v.status,
          id,
        )
        .first();
      if (!ticket) throw new HttpError(404, "Ticket not found");
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
          deliveryPins: z
            .array(z.string().regex(/^\d{6}$/))
            .max(10000)
            .default([]),
          codMaximum: z.number().int().positive().default(500000),
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
