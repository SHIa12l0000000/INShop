// Integration tests against the starter's loopback-only mock identity.
// Production authentication must also be checked through the Sites gateway.
import test from "node:test";
import assert from "node:assert/strict";
const base = "http://localhost:5173";
const cookie = "__sites_local_auth=1; inshop-site-session=1";
async function request(path, body, authenticated = true) {
  return fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(authenticated ? { Cookie: cookie } : {}),
      Origin: base,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function data(path, body) {
  const r = await request(path, body);
  const d = await r.json();
  assert.equal(r.status, 200, JSON.stringify(d));
  return d;
}
test("Sites opt-in requires a verified platform identity, not only a cookie", async () => {
  const r = await fetch(base + "/api/store/session", {
    headers: {
      Cookie: "inshop-site-session=1",
      "oai-authenticated-user-id": "forged",
      "oai-authenticated-user-email": "forged@example.com",
    },
  });
  assert.equal((await r.json()).user, null);
  const { user } = await data("/api/store/session");
  assert.equal(user.id, "site:local_seedy");
  assert.equal(user.provider, "site");
  assert.equal(user.role, "customer");
});
test("a signed-in customer cannot read or mutate admin resources", async () => {
  for (const path of [
    "products",
    "orders",
    "customers",
    "settings",
    "refunds",
  ]) {
    assert.equal((await request("/api/admin/" + path)).status, 403);
    assert.equal((await request("/api/admin/" + path, {})).status, 403);
  }
});
test("addresses validate, persist edits and defaults, and reject unknown ownership", async () => {
  const address = {
    name: "Local integration test",
    phone: "9000000000",
    pin: "201001",
    street: "Test building 101",
    area: "Test area",
    city: "Ghaziabad",
    state: "Uttar Pradesh",
    type: "Home",
  };
  assert.equal(
    (await request("/api/store/addresses", { ...address, pin: "bad" })).status,
    400,
  );
  await data("/api/store/addresses", address);
  const row = (await data("/api/store/addresses")).rows.find(
    (r) => JSON.parse(r.data).name === address.name,
  );
  assert.ok(row);
  try {
    await data("/api/store/addresses/" + row.id, {
      ...address,
      street: "Updated test building 202",
    });
    await data("/api/store/addresses/" + row.id + "/default", {});
    const saved = (await data("/api/store/addresses")).rows.find(
      (r) => r.id === row.id,
    );
    assert.equal(JSON.parse(saved.data).street, "Updated test building 202");
    assert.equal(saved.is_default, 1);
    assert.equal(
      (await request("/api/store/addresses/" + crypto.randomUUID(), address))
        .status,
      404,
    );
    assert.equal(
      (
        await request(
          "/api/store/addresses/" + crypto.randomUUID() + "/default",
          {},
        )
      ).status,
      404,
    );
  } finally {
    await data("/api/store/addresses/" + row.id + "/delete", {});
  }
});
test("customer cart persists server-side and rejects invalid quantities", async () => {
  const prior = await data("/api/store/cart");
  const p = (await data("/api/store/catalog")).products[0];
  const items = [{ id: p.id, quantity: 2, variant: "standard" }];
  try {
    await data("/api/store/cart", { items });
    assert.deepEqual((await data("/api/store/cart")).items, items);
    assert.equal(
      (
        await request("/api/store/cart", {
          items: [{ ...items[0], quantity: 999 }],
        })
      ).status,
      400,
    );
  } finally {
    await data("/api/store/cart", prior);
  }
});
test("concurrent support replies append without losing messages", async () => {
  const subject = "Integration " + crypto.randomUUID();
  await data("/api/store/tickets", {
    subject,
    category: "Account",
    message: "Testing persistent support ticket conversations.",
  });
  const ticket = (await data("/api/store/tickets")).rows.find(
    (r) => r.subject === subject,
  );
  assert.ok(ticket);
  await Promise.all(
    ["First test reply", "Second test reply"].map((message) =>
      data("/api/store/tickets/" + ticket.id + "/reply", { message }),
    ),
  );
  const saved = (await data("/api/store/tickets")).rows.find(
    (r) => r.id === ticket.id,
  );
  assert.equal(JSON.parse(saved.messages).length, 3);
  assert.equal(
    (
      await request("/api/store/tickets/" + crypto.randomUUID() + "/reply", {
        message: "Not my ticket",
      })
    ).status,
    404,
  );
});
test("sample catalog cannot create a live order, even when authenticated", async () => {
  const p = (await data("/api/store/catalog")).products[0];
  const r = await request("/api/store/checkout", {
    items: [{ id: p.id, quantity: 1, variant: "standard" }],
    address: {
      name: "Local test",
      phone: "9000000000",
      pin: "201001",
      street: "Test building 101",
      city: "Ghaziabad",
      state: "Uttar Pradesh",
    },
    method: "cod",
    idempotencyKey: crypto.randomUUID(),
  });
  assert.equal(r.status, 503);
  assert.equal((await request("/api/store/orders/INS-NOT-OWNED")).status, 404);
});
