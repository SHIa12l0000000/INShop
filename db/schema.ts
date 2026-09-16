import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    brand: text("brand").notNull(),
    category: text("category").notNull(),
    price: integer("price").notNull(),
    mrp: integer("mrp").notNull(),
    stock: integer("stock").notNull(),
    status: text("status").notNull().default("active"),
    data: text("data").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    index("idx_products_category").on(t.category),
    index("idx_products_status").on(t.status),
    check("stock_nonnegative", sql`${t.stock} >= 0`),
    check("price_positive", sql`${t.price} > 0`),
  ],
);
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: text("role").notNull().default("customer"),
  status: text("status").notNull().default("active"),
  createdAt: integer("created_at").notNull(),
  lastLoginAt: integer("last_login_at").notNull(),
});
export const addresses = sqliteTable(
  "addresses",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    data: text("data").notNull(),
    isDefault: integer("is_default").default(0),
  },
  (t) => [index("idx_addresses_user").on(t.userId)],
);
export const carts = sqliteTable("carts", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id),
  data: text("data").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
export const wishlists = sqliteTable(
  "wishlists",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    data: text("data").notNull(),
    shareToken: text("share_token").unique(),
  },
  (t) => [index("idx_wishlists_user").on(t.userId)],
);
export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    reference: text("reference").notNull().unique(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status").notNull(),
    paymentStatus: text("payment_status").notNull(),
    method: text("method").notNull(),
    total: integer("total").notNull(),
    data: text("data").notNull(),
    gatewayId: text("gateway_id"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("idx_orders_user_date").on(t.userId, t.createdAt),
    uniqueIndex("idx_order_idempotency").on(t.userId, t.idempotencyKey),
  ],
);
export const orderItems = sqliteTable(
  "order_items",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    quantity: integer("quantity").notNull(),
    price: integer("price").notNull(),
    data: text("data").notNull(),
  },
  (t) => [index("idx_items_order").on(t.orderId)],
);
export const inventoryTransactions = sqliteTable("inventory_transactions", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull(),
  orderId: text("order_id"),
  delta: integer("delta").notNull(),
  reason: text("reason").notNull(),
  createdAt: integer("created_at").notNull(),
});
export const coupons = sqliteTable(
  "coupons",
  {
    code: text("code").primaryKey(),
    kind: text("kind").notNull(),
    value: integer("value").notNull(),
    minimum: integer("minimum").notNull(),
    maximum: integer("maximum").notNull(),
    remaining: integer("remaining").notNull(),
    expiresAt: integer("expires_at").notNull(),
    active: integer("active").notNull().default(1),
  },
  (t) => [check("remaining_nonnegative", sql`${t.remaining} >= 0`)],
);
export const couponUses = sqliteTable(
  "coupon_uses",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    userId: text("user_id").notNull(),
    orderId: text("order_id").notNull(),
  },
  (t) => [uniqueIndex("idx_coupon_user").on(t.code, t.userId)],
);
export const reviews = sqliteTable(
  "reviews",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    rating: integer("rating").notNull(),
    body: text("body").notNull(),
    verified: integer("verified").notNull(),
    status: text("status").notNull().default("published"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("idx_review_user_product").on(t.userId, t.productId)],
);
export const questions = sqliteTable("questions", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull(),
  userId: text("user_id").notNull(),
  body: text("body").notNull(),
  answer: text("answer"),
  createdAt: integer("created_at").notNull(),
});
export const tickets = sqliteTable("tickets", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  subject: text("subject").notNull(),
  category: text("category").notNull(),
  status: text("status").notNull(),
  messages: text("messages").notNull(),
  createdAt: integer("created_at").notNull(),
});
export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    href: text("href").notNull(),
    read: integer("read").notNull().default(0),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("idx_notifications_user").on(t.userId)],
);
export const returns = sqliteTable("returns", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull().unique(),
  userId: text("user_id").notNull(),
  reason: text("reason").notNull(),
  type: text("type").notNull(),
  status: text("status").notNull(),
  createdAt: integer("created_at").notNull(),
});
export const refunds = sqliteTable("refunds", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull(),
  gatewayId: text("gateway_id"),
  status: text("status").notNull(),
  amount: integer("amount").notNull(),
  createdAt: integer("created_at").notNull(),
});
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
export const content = sqliteTable(
  "content",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    data: text("data").notNull(),
    position: integer("position").notNull().default(0),
    active: integer("active").notNull().default(1),
  },
  (t) => [index("idx_content_kind").on(t.kind)],
);
export const adminLogs = sqliteTable("admin_logs", {
  id: text("id").primaryKey(),
  adminId: text("admin_id").notNull(),
  action: text("action").notNull(),
  resource: text("resource").notNull(),
  metadata: text("metadata").notNull(),
  createdAt: integer("created_at").notNull(),
});
export const webhookEvents = sqliteTable("webhook_events", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  createdAt: integer("created_at").notNull(),
});
export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  window: integer("window").notNull(),
});
export const sellers = sqliteTable("sellers", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  name: text("name").notNull(),
  status: text("status").notNull(),
  commission: integer("commission").notNull().default(10),
});
export const payouts = sqliteTable("seller_payouts", {
  id: text("id").primaryKey(),
  sellerId: text("seller_id").notNull(),
  amount: integer("amount").notNull(),
  status: text("status").notNull(),
  createdAt: integer("created_at").notNull(),
});
export const priceHistory = sqliteTable("price_history", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull(),
  price: integer("price").notNull(),
  createdAt: integer("created_at").notNull(),
});
export const activities = sqliteTable("activities", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  kind: text("kind").notNull(),
  data: text("data").notNull(),
  createdAt: integer("created_at").notNull(),
});
