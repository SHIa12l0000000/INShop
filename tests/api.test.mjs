import test from "node:test";
import assert from "node:assert/strict";
const base = process.env.TEST_BASE_URL ?? "http://localhost:5173";
test("catalog comes from database with realistic sample records", async () => {
  const r = await fetch(base + "/api/store/catalog");
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.ok(d.products.length >= 50);
  assert.ok(new Set(d.products.map((p) => p.category)).size >= 10);
  assert.ok(d.products.every((p) => Number.isInteger(p.price) && p.price > 0));
  assert.equal(d.commerceEnabled, false);
});
test("private customer and admin endpoints deny unauthenticated requests", async () => {
  for (const path of [
    "/api/store/orders",
    "/api/store/addresses",
    "/api/admin/products",
    "/api/admin/customers",
    "/api/admin/settings",
  ]) {
    const r = await fetch(base + path);
    assert.equal(r.status, 401, path);
    assert.equal(r.headers.get("cache-control"), "no-store");
  }
});
test("forged identity headers never grant access", async () => {
  const r = await fetch(base + "/api/admin/products", {
    headers: {
      "x-role": "admin",
      "oai-authenticated-user-id": "admin",
      "oai-authenticated-user-email": "admin@example.com",
    },
  });
  assert.equal(r.status, 401);
});
test("cross origin mutation is rejected before processing data", async () => {
  const r = await fetch(base + "/api/store/checkout", {
    method: "POST",
    headers: {
      Origin: "https://untrusted.example",
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(r.status, 403);
});
test("guest cannot checkout even with fabricated totals", async () => {
  const r = await fetch(base + "/api/store/checkout", {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({ total: 1, items: [] }),
  });
  assert.equal(r.status, 401);
});
test("valid coupon is calculated from stored product price", async () => {
  const c = await (await fetch(base + "/api/store/catalog")).json();
  const p = c.products.find((p) => p.price >= 99900);
  const r = await fetch(base + "/api/store/coupon", {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({
      code: "WELCOME10",
      items: [{ id: p.id, quantity: 1, variant: "standard", price: 1 }],
      total: 1,
    }),
  });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.subtotal, p.price);
  assert.equal(d.discount, Math.min(100000, Math.floor(p.price * 0.1)));
});
test("unconfigured payments cannot be marked paid by a fabricated webhook", async () => {
  const r = await fetch(base + "/api/payments/webhook", {
    method: "POST",
    headers: { "x-razorpay-signature": "0".repeat(64) },
    body: JSON.stringify({ event: "payment.captured" }),
  });
  assert.ok([401, 503].includes(r.status));
});
