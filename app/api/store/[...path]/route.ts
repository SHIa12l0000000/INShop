import { z } from "zod";
import { checkoutQuote } from "../../../../lib/checkout-quote";
import {
  allProducts,
  database,
  initialize,
  settingsValue,
  config,
} from "../../../../lib/database";
import {
  authConfigured,
  googleAuthConfigured,
  emailDeliveryConfigured,
  siteAuthConfigured,
  currentUser,
  requireUser,
} from "../../../../lib/auth";
import {
  jsonBody,
  sameOrigin,
  rateLimit,
  errorResponse,
  HttpError,
} from "../../../../lib/security";
import {
  addressSchema,
  cartSchema,
  calculateTotal,
} from "../../../../lib/commerce";
import { createOrder, cancelOrder } from "../../../../lib/orders";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path } = await params;
    const [resource, id] = path;
    await initialize();
    const db = database();
    if (resource === "catalog") {
      const products = await allProducts();
      const banners = await db
        .prepare(
          "SELECT * FROM content WHERE kind='banners' AND active=1 ORDER BY position",
        )
        .all();
      return Response.json(
        {
          products,
          banners: banners.results.map((b) => ({
            ...b,
            ...JSON.parse(b.data as string),
          })),
          settings: await settingsValue(),
          authConfigured: authConfigured(),
          googleAuthConfigured: googleAuthConfigured(),
          emailDeliveryConfigured: emailDeliveryConfigured(),
          siteAuthConfigured: siteAuthConfigured(),
          commerceEnabled: config("COMMERCE_ENABLED") === "true",
          paymentsConfigured: !!config("RAZORPAY_KEY_ID"),
        },
        { headers: { "Cache-Control": "public,max-age=30" } },
      );
    }
    if (resource === "product") {
      const row = await db
        .prepare("SELECT * FROM products WHERE slug=?")
        .bind(id)
        .first();
      if (!row) throw new HttpError(404, "Product not found");
      const reviews = await db
        .prepare(
          "SELECT * FROM reviews WHERE product_id=? AND status='published' ORDER BY created_at DESC LIMIT 100",
        )
        .bind(row.id)
        .all();
      const questions = await db
        .prepare(
          "SELECT * FROM questions WHERE product_id=? ORDER BY created_at DESC LIMIT 50",
        )
        .bind(row.id)
        .all();
      return Response.json({
        reviews: reviews.results,
        questions: questions.results,
      });
    }
    if (resource === "shared-wishlist") {
      const row = await db
        .prepare("SELECT name,data FROM wishlists WHERE share_token=?")
        .bind(id)
        .first();
      if (!row) throw new HttpError(404, "List not found");
      return Response.json(row);
    }
    if (resource === "session") {
      const user = await currentUser();
      return Response.json(
        { user },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const u = await requireUser();
    let rows;
    if (resource === "orders") {
      rows = id
        ? await db
            .prepare("SELECT * FROM orders WHERE reference=? AND user_id=?")
            .bind(id, u.id)
            .all()
        : await db
            .prepare(
              "SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC LIMIT 100",
            )
            .bind(u.id)
            .all();
      if (id && !rows.results.length)
        throw new HttpError(404, "Order not found");
    } else if (resource === "addresses")
      rows = await db
        .prepare("SELECT * FROM addresses WHERE user_id=?")
        .bind(u.id)
        .all();
    else if (resource === "wishlists")
      rows = await db
        .prepare("SELECT * FROM wishlists WHERE user_id=?")
        .bind(u.id)
        .all();
    else if (resource === "cart")
      return Response.json({
        items: JSON.parse(
          (
            await db
              .prepare("SELECT data FROM carts WHERE user_id=?")
              .bind(u.id)
              .first<{ data: string }>()
          )?.data ?? "[]",
        ),
      });
    else if (resource === "notifications")
      rows = await db
        .prepare(
          "SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50",
        )
        .bind(u.id)
        .all();
    else if (resource === "reviews")
      rows = await db
        .prepare("SELECT * FROM reviews WHERE user_id=?")
        .bind(u.id)
        .all();
    else if (resource === "tickets")
      rows = await db
        .prepare(
          "SELECT * FROM tickets WHERE user_id=? ORDER BY created_at DESC LIMIT 50",
        )
        .bind(u.id)
        .all();
    else if (resource === "recently-viewed")
      rows = await db
        .prepare(
          "SELECT * FROM activities WHERE user_id=? AND kind='view' ORDER BY created_at DESC LIMIT 20",
        )
        .bind(u.id)
        .all();
    else if (resource === "export") {
      const data = {
        profile: u,
        orders: (
          await db
            .prepare("SELECT * FROM orders WHERE user_id=?")
            .bind(u.id)
            .all()
        ).results,
        addresses: (
          await db
            .prepare("SELECT * FROM addresses WHERE user_id=?")
            .bind(u.id)
            .all()
        ).results,
        wishlists: (
          await db
            .prepare("SELECT * FROM wishlists WHERE user_id=?")
            .bind(u.id)
            .all()
        ).results,
      };
      return new Response(JSON.stringify(data, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition":
            'attachment; filename="inshop-personal-data.json"',
          "Cache-Control": "no-store",
        },
      });
    } else throw new HttpError(404, "Not found");
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
    await initialize();
    const { path } = await params;
    const [resource, id, action] = path;
    await rateLimit(req, resource, resource === "checkout" ? 8 : 30);
    const b = await jsonBody(req);
    const db = database();
    if (resource === "quote" || resource === "coupon") {
      const user = await currentUser();
      const quote = await checkoutQuote(
        resource === "coupon" ? { ...b, coupon: b.code } : b,
        user?.id,
      );
      return Response.json(
        {
          ...quote.totals,
          lines: quote.lines,
          coupon: quote.coupon?.code ?? null,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const u = await requireUser();
    if (resource === "checkout")
      return Response.json({ order: await createOrder(u, b) });
    if (resource === "cart") {
      const lines = z.array(cartSchema.element).max(50).parse(b.items);
      await db
        .prepare(
          "INSERT INTO carts VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at",
        )
        .bind(u.id, JSON.stringify(lines), Date.now())
        .run();
    } else if (resource === "profile") {
      const v = z.object({ name: z.string().min(2).max(100) }).parse(b);
      await db
        .prepare("UPDATE users SET name=? WHERE id=?")
        .bind(v.name, u.id)
        .run();
    } else if (resource === "addresses") {
      if (action === "default") {
        const owned = await db
          .prepare("SELECT id FROM addresses WHERE id=? AND user_id=?")
          .bind(id, u.id)
          .first();
        if (!owned) throw new HttpError(404, "Address not found.");
        await db.batch([
          db
            .prepare("UPDATE addresses SET is_default=0 WHERE user_id=?")
            .bind(u.id),
          db
            .prepare(
              "UPDATE addresses SET is_default=1 WHERE id=? AND user_id=?",
            )
            .bind(id, u.id),
        ]);
      } else if (action === "delete") {
        await db
          .prepare("DELETE FROM addresses WHERE id=? AND user_id=?")
          .bind(id, u.id)
          .run();
      } else {
        const v = addressSchema.parse(b);
        if (id) {
          const changed = await db
            .prepare(
              "UPDATE addresses SET data=? WHERE id=? AND user_id=? RETURNING id",
            )
            .bind(JSON.stringify(v), id, u.id)
            .first();
          if (!changed) throw new HttpError(404, "Address not found.");
        } else
          await db
            .prepare("INSERT INTO addresses VALUES (?,?,?,0)")
            .bind(crypto.randomUUID(), u.id, JSON.stringify(v))
            .run();
      }
    } else if (resource === "wishlists") {
      const v = z
        .object({
          name: z.string().min(1).max(80),
          items: z.array(z.string().max(100)).max(200),
          id: z.string().uuid().optional(),
        })
        .parse(b);
      if (v.id)
        await db
          .prepare(
            "UPDATE wishlists SET name=?,data=? WHERE id=? AND user_id=?",
          )
          .bind(v.name, JSON.stringify(v.items), v.id, u.id)
          .run();
      else {
        const listId = crypto.randomUUID();
        await db
          .prepare("INSERT INTO wishlists VALUES (?,?,?,?,?)")
          .bind(
            listId,
            u.id,
            v.name,
            JSON.stringify(v.items),
            crypto.randomUUID(),
          )
          .run();
        return Response.json({ ok: true, id: listId });
      }
    } else if (resource === "orders" && action === "cancel") {
      const v = z
        .object({
          reason: z.string().min(3).max(300).default("Customer request"),
        })
        .parse(b);
      await cancelOrder(id, u.id, v.reason);
    } else if (resource === "orders" && action === "return") {
      const v = z
        .object({
          reason: z.string().min(10).max(2000),
          type: z.literal("Refund"),
        })
        .parse(b);
      const o = await db
        .prepare(
          "SELECT id FROM orders WHERE id=? AND user_id=? AND status='delivered'",
        )
        .bind(id, u.id)
        .first();
      if (!o)
        throw new HttpError(
          409,
          "Only delivered orders are eligible for a return request.",
        );
      const returnId = crypto.randomUUID();
      const returned = await db.batch([
        db
          .prepare(
            "INSERT INTO returns SELECT ?,id,user_id,?,?,?,? FROM orders WHERE id=? AND user_id=? AND status='delivered' RETURNING id",
          )
          .bind(returnId, v.reason, v.type, "requested", Date.now(), id, u.id),
        db
          .prepare(
            "UPDATE orders SET status='return-requested' WHERE id=? AND user_id=? AND EXISTS(SELECT 1 FROM returns WHERE id=?)",
          )
          .bind(id, u.id, returnId),
      ]);
      if (!returned[0].results.length)
        throw new HttpError(
          409,
          "A return request already exists or the order changed.",
        );
    } else if (resource === "reviews") {
      if (action === "delete") {
        await db
          .prepare("DELETE FROM reviews WHERE id=? AND user_id=?")
          .bind(id, u.id)
          .run();
        return Response.json({ ok: true });
      }
      const v = z
        .object({
          productId: z.string().max(100),
          rating: z.number().int().min(1).max(5),
          body: z.string().min(20).max(3000),
        })
        .parse(b);
      const purchased = await db
        .prepare(
          "SELECT oi.id FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.user_id=? AND oi.product_id=? AND o.status='delivered'",
        )
        .bind(u.id, v.productId)
        .first();
      if (!purchased)
        throw new HttpError(
          403,
          "Reviews are available after your purchase is delivered.",
        );
      await db
        .prepare(
          "INSERT INTO reviews VALUES (?,?,?,?,?,?,1,'published',?) ON CONFLICT(user_id,product_id) DO UPDATE SET rating=excluded.rating,body=excluded.body,status='published'",
        )
        .bind(
          crypto.randomUUID(),
          v.productId,
          u.id,
          u.name,
          v.rating,
          v.body,
          Date.now(),
        )
        .run();
    } else if (resource === "questions") {
      const v = z
        .object({ productId: z.string(), body: z.string().min(10).max(2000) })
        .parse(b);
      await db
        .prepare("INSERT INTO questions VALUES (?,?,?,?,NULL,?)")
        .bind(crypto.randomUUID(), v.productId, u.id, v.body, Date.now())
        .run();
    } else if (resource === "tickets") {
      if (action === "reply") {
        const v = z.object({ message: z.string().min(2).max(5000) }).parse(b);
        const result = await db
          .prepare(
            "UPDATE tickets SET messages=json_insert(messages,'$[#]',json(?)),status='open' WHERE id=? AND user_id=? RETURNING id",
          )
          .bind(
            JSON.stringify({ from: u.name, body: v.message, at: Date.now() }),
            id,
            u.id,
          )
          .first();
        if (!result) throw new HttpError(404, "Ticket not found.");
        return Response.json({ ok: true });
      }
      const v = z
        .object({
          subject: z.string().min(5).max(200),
          category: z.string().min(1).max(50),
          message: z.string().min(20).max(5000),
        })
        .parse(b);
      await db
        .prepare("INSERT INTO tickets VALUES (?,?,?,?,?,?,?)")
        .bind(
          crypto.randomUUID(),
          u.id,
          v.subject,
          v.category,
          "open",
          JSON.stringify([{ from: u.name, body: v.message, at: Date.now() }]),
          Date.now(),
        )
        .run();
    } else if (resource === "notifications")
      await db
        .prepare("UPDATE notifications SET read=1 WHERE user_id=?")
        .bind(u.id)
        .run();
    else if (resource === "recently-viewed") {
      const v = z.object({ productId: z.string().max(100) }).parse(b);
      await db
        .prepare("INSERT INTO activities VALUES (?,?, 'view',?,?)")
        .bind(crypto.randomUUID(), u.id, JSON.stringify(v), Date.now())
        .run();
    } else if (resource === "stock-alerts") {
      const v = z.object({ productId: z.string().max(100) }).parse(b);
      await db
        .prepare("INSERT INTO activities VALUES (?,?,'stock-alert',?,?)")
        .bind(crypto.randomUUID(), u.id, JSON.stringify(v), Date.now())
        .run();
    } else throw new HttpError(404, "Action not found");
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
