import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateTotal,
  checkoutSchema,
  canTransition,
} from "../lib/commerce.ts";
import {
  hasAdminAccess,
  ownsResource,
  mayEditSellerProduct,
} from "../lib/policies.ts";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
test("server totals use integer paise, coupon cap and shipping threshold", () => {
  assert.deepEqual(
    calculateTotal([{ price: 50000, quantity: 3 }], {
      kind: "percent",
      value: 10,
      minimum: 99900,
      maximum: 10000,
    }),
    { subtotal: 150000, discount: 10000, shipping: 0, total: 140000 },
  );
  assert.equal(calculateTotal([{ price: 49900, quantity: 1 }]).total, 54800);
});
test("checkout rejects negative quantity, noninteger quantities and invalid address", () => {
  assert.throws(() =>
    checkoutSchema.parse({
      items: [{ id: "a", quantity: -3 }],
      address: {},
      method: "cod",
      idempotencyKey: crypto.randomUUID(),
    }),
  );
  assert.throws(() =>
    checkoutSchema.parse({
      items: [{ id: "a", quantity: 1.5 }],
      address: {},
      method: "cod",
      idempotencyKey: crypto.randomUUID(),
    }),
  );
});
test("customer and seller cannot become admin through a frontend role claim", () => {
  assert.equal(hasAdminAccess("customer", "aal2"), false);
  assert.equal(hasAdminAccess("seller", "aal2"), false);
  assert.equal(hasAdminAccess("admin", "aal1"), false);
  assert.equal(hasAdminAccess("admin", "aal2"), true);
});
test("resource ownership rejects cross-customer access", () => {
  assert.equal(ownsResource("customer-a", "customer-b"), false);
  assert.equal(ownsResource("customer-a", "customer-a"), true);
  assert.equal(ownsResource("", ""), false);
});
test("seller permission excludes other sellers products", () => {
  assert.equal(mayEditSellerProduct("seller", "seller-a", "seller-b"), false);
  assert.equal(mayEditSellerProduct("seller", "seller-a", "seller-a"), true);
  assert.equal(mayEditSellerProduct("customer", "seller-a", "seller-a"), false);
});
test("fulfillment cannot jump from placed to delivered", () => {
  assert.equal(canTransition("placed", "delivered"), false);
  assert.equal(canTransition("packed", "shipped"), true);
  assert.equal(canTransition("delivered", "cancelled"), false);
});
test("database stock constraint rolls back an overselling transaction", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(fs.readFileSync("drizzle/0000_slimy_madame_web.sql", "utf8"));
  db.exec(
    "INSERT INTO products VALUES ('p','sample','Sample','Brand','Category',100,150,1,'active','{}',0)",
  );
  db.exec("BEGIN;UPDATE products SET stock=stock-1 WHERE id='p';COMMIT");
  assert.throws(() => {
    try {
      db.exec("BEGIN;UPDATE products SET stock=stock-1 WHERE id='p';COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  });
  assert.equal(
    (db.prepare("SELECT stock FROM products WHERE id='p'").get() as any).stock,
    0,
  );
  db.close();
});
test("webhook event IDs cannot be inserted twice", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(fs.readFileSync("drizzle/0000_slimy_madame_web.sql", "utf8"));
  db.exec(
    "INSERT INTO webhook_events VALUES ('evt-test','payment.captured',0)",
  );
  assert.throws(() =>
    db.exec(
      "INSERT INTO webhook_events VALUES ('evt-test','payment.captured',1)",
    ),
  );
  db.close();
});
