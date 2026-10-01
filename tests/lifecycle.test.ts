import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import { adjustStock } from "../lib/inventory.ts";
import {
  releaseOrder,
  expireReservations,
  recordCapture,
  transitionOrder,
} from "../lib/order-lifecycle.ts";
import {
  submitRefund,
  updateRefund,
  recordCodRefund,
} from "../lib/refund-lifecycle.ts";

function fixture() {
  const sql = new DatabaseSync(":memory:");
  for (const file of fs
    .readdirSync("drizzle")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    sql.exec(fs.readFileSync("drizzle/" + file, "utf8"));
  const db: any = {
    prepare(query: string) {
      let bindings: any[] = [];
      const statement: any = {
        bind(...args: any[]) {
          bindings = args;
          return statement;
        },
        async first() {
          return sql.prepare(query).get(...bindings) ?? null;
        },
        async all() {
          return { results: sql.prepare(query).all(...bindings) };
        },
        async run() {
          return { meta: sql.prepare(query).run(...bindings) };
        },
        execute() {
          return {
            results: sql.prepare(query).all(...bindings),
            success: true,
          };
        },
      };
      return statement;
    },
    async batch(statements: any[]) {
      sql.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map((s) => s.execute());
        sql.exec("COMMIT");
        return results;
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    },
  };
  sql.exec(
    "INSERT INTO users VALUES ('alice','alice@example.test','Alice','customer','active',1,1); INSERT INTO products VALUES ('p','item','Item','Brand','Home',10000,12000,3,'active','{}',1); INSERT INTO coupons VALUES ('SAVE','fixed',1000,0,1000,9,9999999999999,1);",
  );
  function order(id = "o", payment = "pending", expires = 100) {
    sql
      .prepare(
        "INSERT INTO orders (id,reference,user_id,idempotency_key,status,payment_status,method,total,data,created_at,gateway_id,expires_at,payment_id) VALUES (?,?,'alice',?,'placed',?,'razorpay',10000,?,1,?,?,?)",
      )
      .run(
        id,
        "INS-" + id,
        id,
        payment,
        JSON.stringify({ history: [], coupon: "SAVE" }),
        "order_" + id,
        expires,
        payment === "paid" ? "pay_" + id : null,
      );
    sql
      .prepare("INSERT INTO order_items VALUES (?,?,?,1,10000,?)")
      .run("item_" + id, id, "p", "{}");
    sql
      .prepare("INSERT INTO coupon_uses VALUES (?,?,?,?)")
      .run("cu_" + id, "SAVE", "alice", id);
  }
  const row = (id = "o") =>
    sql.prepare("SELECT * FROM orders WHERE id=?").get(id) as any;
  return {
    sql,
    db,
    order,
    row,
    stock: () =>
      Number(
        sql.prepare("SELECT stock FROM products WHERE id='p'").get()!.stock,
      ),
  };
}
const payment = (id = "o") => ({
  id: "pay_" + id,
  order_id: "order_" + id,
  amount: 10000,
  currency: "INR",
  status: "captured",
  captured: true,
});

test("stale inventory edits cannot overwrite a concurrent stock change", async () => {
  const f = fixture();
  f.sql.exec("UPDATE products SET stock=2 WHERE id='p'");
  await assert.rejects(adjustStock(f.db, "p", 10, 3), /Stock changed/);
  assert.equal(f.stock(), 2);
  assert.equal(
    f.sql.prepare("SELECT COUNT(*) n FROM inventory_transactions").get()!.n,
    0,
  );
  await adjustStock(f.db, "p", 10, 2);
  assert.equal(f.stock(), 10);
  assert.equal(
    f.sql.prepare("SELECT delta FROM inventory_transactions").get()!.delta,
    8,
  );
  f.sql.close();
});
test("partially refunded captures are held for review and cannot fulfill", async () => {
  const f = fixture();
  f.order();
  await recordCapture(f.db, "partial", {
    ...payment(),
    amount_refunded: 5000,
    refund_status: "partial",
  });
  assert.equal(f.row().payment_status, "review-required");
  await assert.rejects(transitionOrder(f.db, "o", "processing"), /unpaid/);
  f.sql.close();
});
test("COD delivery needs collection confirmation and offline refunds need a payout record", async () => {
  const f = fixture();
  f.order();
  f.sql.exec(
    "UPDATE orders SET method='cod',payment_status='due',status='out-for-delivery',gateway_id=NULL",
  );
  await assert.rejects(transitionOrder(f.db, "o", "delivered"), /unpaid/);
  await transitionOrder(f.db, "o", "delivered", undefined, undefined, true);
  assert.equal(f.row().payment_status, "paid");
  f.sql.exec(
    "UPDATE orders SET status='returned',payment_status='refund-pending'; INSERT INTO refunds(id,order_id,status,amount,created_at,updated_at) VALUES('refund-cod','o','requested',10000,1,1)",
  );
  await recordCodRefund(f.db, "refund-cod", "BANK-TEST-12345");
  assert.equal(f.row().payment_status, "refunded");
  assert.equal(
    f.sql.prepare("SELECT gateway_id FROM refunds").get()!.gateway_id,
    "manual:BANK-TEST-12345",
  );
  await assert.rejects(
    recordCodRefund(f.db, "refund-cod", "BANK-TEST-12345"),
    /outstanding/,
  );
  f.sql.close();
});
test("manual COD refund endpoint cannot complete an online refund", async () => {
  const f = fixture();
  f.order("o", "paid");
  await releaseOrder(f.db, "o", "alice", "cancel");
  const id = String(f.sql.prepare("SELECT id FROM refunds").get()!.id);
  await assert.rejects(
    recordCodRefund(f.db, id, "BANK-TEST-9999"),
    /cash-on-delivery/,
  );
  assert.equal(f.row().payment_status, "refund-pending");
  f.sql.close();
});

test("concurrent cancellation releases inventory and coupon exactly once", async () => {
  const f = fixture();
  f.order();
  const result = await Promise.all([
    releaseOrder(f.db, "o", "alice", "cancel"),
    releaseOrder(f.db, "o", "alice", "cancel"),
  ]);
  assert.equal(result.filter(Boolean).length, 1);
  assert.equal(f.stock(), 4);
  assert.equal(
    f.sql.prepare("SELECT remaining FROM coupons").get()!.remaining,
    10,
  );
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM coupon_uses").get()!.n, 0);
  f.sql.close();
});
test("another customer cannot cancel an order", async () => {
  const f = fixture();
  f.order();
  assert.equal(await releaseOrder(f.db, "o", "bob", "cancel"), false);
  assert.equal(f.stock(), 3);
  f.sql.close();
});
test("expiry releases only overdue pending online reservations", async () => {
  const f = fixture();
  f.order();
  assert.equal(await expireReservations(f.db, 99), 0);
  assert.equal(await expireReservations(f.db, 101), 1);
  assert.equal(await expireReservations(f.db, 102), 0);
  assert.equal(f.row().status, "expired");
  f.sql.close();
});
test("late captured payment creates one refund and never reopens an expired order", async () => {
  const f = fixture();
  f.order();
  await expireReservations(f.db, 101);
  await recordCapture(f.db, "evt1", payment());
  await recordCapture(f.db, "evt2", payment());
  assert.equal(f.row().status, "expired");
  assert.equal(f.row().payment_status, "refund-pending");
  assert.equal(f.stock(), 4);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM refunds").get()!.n, 1);
  f.sql.close();
});
test("duplicate concurrent captures are acknowledged without duplicate effects", async () => {
  const f = fixture();
  f.order();
  await Promise.all([
    recordCapture(f.db, "evt", payment()),
    recordCapture(f.db, "evt", payment()),
  ]);
  assert.equal(f.row().payment_status, "paid");
  assert.equal(
    f.sql.prepare("SELECT COUNT(*) n FROM webhook_events").get()!.n,
    1,
  );
  assert.equal(await expireReservations(f.db, 1000), 0);
  f.sql.close();
});
test("payment amount mismatch never pays an order", async () => {
  const f = fixture();
  f.order();
  await assert.rejects(
    recordCapture(f.db, "bad", { ...payment(), amount: 1 }),
    /match/,
  );
  assert.equal(f.row().payment_status, "pending");
  f.sql.close();
});
test("capture racing cancellation always produces a refund obligation", async () => {
  for (const first of ["capture", "cancel"]) {
    const f = fixture();
    f.order();
    const capture = () => recordCapture(f.db, "evt", payment());
    const cancel = () => releaseOrder(f.db, "o", "alice", "cancel");
    await Promise.all(
      first === "capture" ? [capture(), cancel()] : [cancel(), capture()],
    );
    assert.equal(f.row().payment_status, "refund-pending");
    assert.equal(f.stock(), 4);
    assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM refunds").get()!.n, 1);
    f.sql.close();
  }
});
test("unpaid orders cannot be fulfilled and shipments need tracking", async () => {
  const f = fixture();
  f.order();
  await assert.rejects(transitionOrder(f.db, "o", "processing"), /unpaid/);
  await recordCapture(f.db, "evt", payment());
  await transitionOrder(f.db, "o", "processing");
  await transitionOrder(f.db, "o", "packed");
  await assert.rejects(transitionOrder(f.db, "o", "shipped"), /tracking/);
  await transitionOrder(f.db, "o", "shipped", "SHIP123", "Courier");
  assert.equal(f.row().status, "shipped");
  assert.equal(await releaseOrder(f.db, "o", "alice", "cancel"), false);
  f.sql.close();
});
test("uncertain refund retries reuse the same durable key and amount", async () => {
  const f = fixture();
  f.order("o", "paid");
  await releaseOrder(f.db, "o", "alice", "cancel");
  const id = f.sql.prepare("SELECT id FROM refunds").get()!.id as string;
  const calls: any[] = [];
  await assert.rejects(
    submitRefund(
      f.db,
      id,
      async (...args) => {
        calls.push(args);
        throw Error("timeout");
      },
      1000,
    ),
  );
  assert.equal(
    f.sql.prepare("SELECT status FROM refunds").get()!.status,
    "uncertain",
  );
  await submitRefund(
    f.db,
    id,
    async (...args) => {
      calls.push(args);
      return {
        id: "rfnd_1",
        payment_id: "pay_o",
        amount: 10000,
        status: "pending",
      };
    },
    1001,
  );
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(f.row().payment_status, "refund-pending");
  await updateRefund(f.db, id, {
    id: "rfnd_1",
    payment_id: "pay_o",
    amount: 10000,
    status: "processed",
  });
  await updateRefund(f.db, id, {
    id: "rfnd_1",
    payment_id: "pay_o",
    amount: 10000,
    status: "pending",
  });
  assert.equal(f.row().payment_status, "refunded");
  f.sql.close();
});
