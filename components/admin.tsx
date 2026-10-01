"use client";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  Users,
  BarChart3,
  Settings,
  Search,
  Bell,
  ArrowUpRight,
  Download,
  Plus,
  Menu,
  ShieldCheck,
  LogOut,
} from "lucide-react";
import { api, useStore } from "./store-provider";
import { money } from "../lib/types";
import { Modal, Empty } from "./ui";
import AuthForm from "./auth-form";
import AdminOperations from "./admin-operations";
const sections = [
  "Dashboard",
  "Orders",
  "Products",
  "Inventory",
  "Customers",
  "Categories",
  "Brands",
  "Coupons",
  "Promotions",
  "Banners",
  "Homepage",
  "Reviews",
  "Questions",
  "Returns",
  "Refunds",
  "Payments",
  "Sellers",
  "Analytics",
  "Support",
  "Settings",
  "Security",
  "Logs",
];
export default function Admin({ route }: { route: string }) {
  const s = useStore();
  const demo = route.startsWith("/admin/demo"),
    section = route.split("/")[demo ? 3 : 2] ?? "dashboard";
  const [rows, setRows] = useState<any[]>([]),
    [stats, setStats] = useState<any>(null),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [editing, setEditing] = useState<any>(null),
    [saveError, setSaveError] = useState(""),
    [saving, setSaving] = useState(false),
    [page, setPage] = useState(1),
    [sidebar, setSidebar] = useState(false);
  const prefix = demo ? "/admin/demo" : "/admin";
  function load() {
    if (demo) {
      setRows(["products", "inventory"].includes(section) ? s.products : []);
      setStats({
        stats: { revenue: 284560000, orders: 1248, aov: 228013 },
        customers: { count: 893 },
        products: { count: 81, low: 7 },
        recent: [],
        trend: [10, 14, 12, 19, 17, 22, 18, 25, 29, 26, 32, 30],
      });
      return;
    }
    api("/api/admin/" + section)
      .then((d) => {
        setRows(d.rows ?? d.recent ?? []);
        setStats(d);
        setError("");
      })
      .catch((e) => setError(e.message));
  }
  useEffect(load, [section, demo, s.products.length]);
  if (route === "/admin/login")
    return (
      <div className="admin-login">
        <AuthForm admin />
        <MfaVerify />
      </div>
    );
  const dashboard = ["dashboard", "analytics", "reports"].includes(section);
  const filtered = rows.filter((r) =>
    JSON.stringify(r).toLowerCase().includes(search.toLowerCase()),
  );
  function exportCsv() {
    const cols =
      section === "products" || section === "inventory"
        ? ["id", "title", "brand", "category", "price", "stock", "status"]
        : Object.keys(rows[0] ?? {}).filter(
            (k) => !["data", "metadata"].includes(k),
          );
    const csv = [
      cols.join(","),
      ...filtered.map((r) =>
        cols
          .map(
            (c) =>
              '"' +
              String(r[c] ?? "")
                .replaceAll('"', '""')
                .replace(/^[=+@-]/, "'") +
              '"',
          )
          .join(","),
      ),
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "inshop-" + section + ".csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="admin-shell">
      <aside className={"admin-sidebar " + (sidebar ? "open" : "")}>
        <a className="logo" href={prefix}>
          <img src="/favicon.svg" alt="" width="32" />
          INShop<small>ADMIN</small>
        </a>
        <div className="admin-workspace">STORE WORKSPACE</div>
        {sections.map((label, i) => {
          const slug = label.toLowerCase();
          const Icon =
            i === 0
              ? LayoutDashboard
              : i === 1
                ? ShoppingBag
                : i === 4
                  ? Users
                  : i > 16
                    ? Settings
                    : Package;
          return (
            <a
              className={section === slug ? "active" : ""}
              key={slug}
              href={prefix + (i === 0 ? "" : "/" + slug)}
            >
              <Icon size={17} />
              {label}
            </a>
          );
        })}
        <div className="admin-sidebar-bottom">
          <div className="avatar">
            {demo ? "D" : (s.user?.name?.[0] ?? "A")}
          </div>
          <span>
            {demo ? "Demo workspace" : (s.user?.name ?? "Administrator")}
            <small>{demo ? "Read-only preview" : "Secure workspace"}</small>
          </span>
        </div>
      </aside>
      <div className="admin-workspace-main">
        <div className="admin-top">
          <button
            className="mobile-filter"
            onClick={() => setSidebar(!sidebar)}
            aria-label="Toggle navigation"
          >
            <Menu />
          </button>
          <span>Workspace / {section[0].toUpperCase() + section.slice(1)}</span>
          <a href="/">View storefront ↗</a>
          <ShieldCheck size={19} />
          <div className="avatar small">{demo ? "D" : "A"}</div>
        </div>
        <main className="admin-content">
          {demo && (
            <div className="demo-banner">
              Demo workspace · Sample analytics · Changes are disabled.{" "}
              <a href="/admin/login">Go to secure admin login →</a>
            </div>
          )}
          <div className="admin-heading">
            <div>
              <span className="eyebrow">YOUR STORE, AT A GLANCE</span>
              <h1>
                {dashboard
                  ? "Store overview"
                  : section[0].toUpperCase() + section.slice(1)}
              </h1>
              <p>
                {dashboard
                  ? "A clear view of how your business is doing."
                  : "Manage your " + section + " in one place."}
              </p>
            </div>
            <div className="row-actions">
              <button className="button secondary" onClick={exportCsv}>
                <Download size={16} />
                Export CSV
              </button>
              {!dashboard &&
                !demo &&
                [
                  "products",
                  "categories",
                  "brands",
                  "coupons",
                  "promotions",
                  "banners",
                  "homepage",
                ].includes(section) && (
                  <button
                    className="button"
                    onClick={() => {
                      setEditing({});
                      setSaveError("");
                    }}
                  >
                    <Plus size={17} />
                    Add {section.slice(0, -1)}
                  </button>
                )}
            </div>
          </div>
          {error ? (
            <div className="panel">
              <ShieldCheck size={32} />
              <h2>Secure administrator access</h2>
              <p>{error}</p>
              <p className="subtext">
                An administrator must be provisioned privately and verify an
                authenticator code. Public registration never grants admin
                access.
              </p>
              <div className="row-actions">
                <a className="button" href="/admin/login">
                  Admin sign in
                </a>
                <a className="button secondary" href="/admin/demo">
                  Explore read-only demo
                </a>
                <a className="text-link" href="/setup">
                  Store setup guide
                </a>
              </div>
            </div>
          ) : dashboard ? (
            <>
              <div className="stat-grid">
                {[
                  [
                    "Revenue",
                    money(stats?.stats?.revenue ?? 0),
                    "Revenue from captured payments",
                  ],
                  [
                    "Orders",
                    (stats?.stats?.orders ?? 0).toLocaleString(),
                    "Orders across your store",
                  ],
                  [
                    "Average order value",
                    money(stats?.stats?.aov ?? 0),
                    "Average customer basket",
                  ],
                  [
                    "Customers",
                    (stats?.customers?.count ?? 0).toLocaleString(),
                    "Registered customers",
                  ],
                ].map(([label, value, note]) => (
                  <div className="stat-card" key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                    <small>{note}</small>
                  </div>
                ))}
              </div>
              <div className="admin-charts">
                <div className="panel">
                  <div className="row-between">
                    <h3>Sales overview</h3>
                    <span className="muted">
                      {demo ? "Sample period" : "Recent days"}
                    </span>
                  </div>
                  <div className="bar-chart">
                    {(demo
                      ? (stats?.trend ?? [])
                      : (stats?.trend?.map((d: any) => d.total) ?? [])
                    ).map((v: number, i: number) => (
                      <div key={i}>
                        <i
                          style={{
                            height:
                              Math.max(
                                8,
                                Math.min(190, demo ? v * 5 : v / 100000),
                              ) + "px",
                          }}
                        />
                        <span>{i + 1}</span>
                      </div>
                    ))}
                  </div>
                  {!demo && !stats?.trend?.length && (
                    <p className="subtext">
                      Sales appear after a payment is captured.
                    </p>
                  )}
                </div>
                <div className="panel">
                  <h3>Inventory health</h3>
                  <div className="inventory-donut">
                    <strong>
                      {stats?.products?.count ?? 0}
                      <span>products</span>
                    </strong>
                  </div>
                  <div className="row-between">
                    <span>Low-stock products</span>
                    <b>{stats?.products?.low ?? 0}</b>
                  </div>
                  <a
                    className="text-link space-top"
                    href={prefix + "/inventory"}
                  >
                    Review inventory →
                  </a>
                </div>
              </div>
              <div className="panel">
                <h3>Recent orders</h3>
                {demo ? (
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Order</th>
                        <th>Customer</th>
                        <th>Total</th>
                        <th>Payment</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        "Ananya Sharma",
                        "Rahul Mehta",
                        "Priya Singh",
                        "Arjun Kapoor",
                      ].map((name, i) => (
                        <tr key={name}>
                          <td>DEMO-0{1048 - i}</td>
                          <td>{name}</td>
                          <td>{money([549900, 89900, 1249900, 349900][i])}</td>
                          <td>
                            <span className="status-green">Sample paid</span>
                          </td>
                          <td>
                            {
                              ["Processing", "Shipped", "Delivered", "Packed"][
                                i
                              ]
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : rows.length ? (
                  <table className="admin-table">
                    <tbody>
                      {rows.map((o) => (
                        <tr key={o.id}>
                          <td>{o.reference}</td>
                          <td>{money(o.total)}</td>
                          <td>{o.payment_status}</td>
                          <td>{o.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="subtext space-top">
                    No orders yet. New orders will appear here.
                  </p>
                )}
              </div>
            </>
          ) : section === "settings" ? (
            <div className="panel">
              <h2>Store configuration</h2>
              <p className="subtext">
                Payment and authentication secrets are configured in the hosting
                environment, never in the browser.
              </p>
              {rows
                .filter((r) => r.key === "store")
                .map((r) => (
                  <button
                    className="button"
                    key={r.key}
                    onClick={() => setEditing(JSON.parse(r.value))}
                  >
                    Edit store settings
                  </button>
                ))}
              {demo && <p>Settings are protected in the read-only demo.</p>}
            </div>
          ) : (
            <div className="panel table-panel">
              <div className="table-toolbar">
                <div className="inline-input">
                  <Search size={17} />
                  <input
                    aria-label="Search table"
                    placeholder={"Search " + section + "…"}
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                  />
                </div>
                <span>{filtered.length} records</span>
              </div>
              <div className="table-scroll">
                <table className="admin-table">
                  <thead>
                    <tr>
                      {(["products", "inventory"].includes(section)
                        ? [
                            "Product",
                            "SKU",
                            "Category",
                            "Price",
                            "Stock",
                            "Status",
                            "Actions",
                          ]
                        : ["Reference / name", "Details", "Status", "Actions"]
                      ).map((c) => (
                        <th key={c}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice((page - 1) * 15, page * 15).map((r) => {
                      const p = r.data ? { ...JSON.parse(r.data), ...r } : r;
                      return ["products", "inventory"].includes(section) ? (
                        <tr key={r.id}>
                          <td>
                            <div className="table-product">
                              <img src={p.thumbnail} alt="" />
                              <span>
                                {r.title}
                                <small>{r.brand}</small>
                              </span>
                            </div>
                          </td>
                          <td>{p.sku}</td>
                          <td>{r.category}</td>
                          <td>{money(r.price)}</td>
                          <td>
                            <span
                              className={r.stock < 10 ? "status-amber" : ""}
                            >
                              {r.stock} units
                            </span>
                          </td>
                          <td>
                            <span className="status-green">{r.status}</span>
                          </td>
                          <td>
                            <button
                              disabled={demo}
                              className="text-link"
                              onClick={() => {
                                setEditing(p);
                                setSaveError("");
                              }}
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      ) : (
                        <tr key={r.id ?? r.code}>
                          <td>
                            {r.title ??
                              r.name ??
                              r.reference ??
                              r.code ??
                              r.subject ??
                              r.id}
                          </td>
                          <td>
                            {r.email ??
                              r.body ??
                              r.action ??
                              (r.total ? money(r.total) : (r.kind ?? "—"))}
                          </td>
                          <td>{r.status ?? (r.active ? "Active" : "—")}</td>
                          <td>
                            <button
                              disabled={demo}
                              className="text-link"
                              onClick={() => {
                                setEditing(r);
                                setSaveError("");
                              }}
                            >
                              View / edit
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {!filtered.length && (
                <p className="subtext table-empty">No {section} to show.</p>
              )}
              <div className="pagination">
                {Array.from(
                  { length: Math.ceil(filtered.length / 15) },
                  (_, i) => (
                    <button
                      key={i}
                      className={page === i + 1 ? "active" : ""}
                      onClick={() => setPage(i + 1)}
                    >
                      {i + 1}
                    </button>
                  ),
                )}
              </div>
            </div>
          )}
        </main>
      </div>
      <Modal
        title={editing?.id ? "Edit " + section : "Add " + section}
        open={!!editing}
        close={() => setEditing(null)}
      >
        {editing && ["orders", "returns", "refunds"].includes(section) ? (
          <AdminOperations
            section={section}
            row={editing}
            onSaved={() => {
              setEditing(null);
              load();
              s.notify("Order operation saved");
            }}
          />
        ) : (
          editing && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setSaving(true);
                setSaveError("");
                const f = new FormData(e.currentTarget);
                let body: any;
                try {
                  if (section === "products")
                    body = {
                      title: f.get("title"),
                      slug: f.get("slug"),
                      brand: f.get("brand"),
                      category: f.get("category"),
                      price: Math.round(Number(f.get("price")) * 100),
                      mrp: Math.round(Number(f.get("mrp")) * 100),
                      stock: Number(f.get("stock")),
                      description: f.get("description"),
                      thumbnail: f.get("thumbnail"),
                      status: f.get("status"),
                      sku: f.get("sku"),
                      demo: f.get("demo") === "on",
                    };
                  else if (section === "inventory")
                    body = {
                      stock: Number(f.get("stock")),
                      expectedStock: editing.stock,
                    };
                  else body = JSON.parse(String(f.get("json")));
                  await api(
                    "/api/admin/" +
                      section +
                      (editing.id ? "/" + editing.id : ""),
                    body,
                  );
                  setEditing(null);
                  load();
                  s.notify("Changes saved");
                } catch (e) {
                  setSaveError((e as Error).message);
                } finally {
                  setSaving(false);
                }
              }}
            >
              {section === "products" ? (
                <>
                  <div className="form-grid">
                    {[
                      "title",
                      "slug",
                      "sku",
                      "brand",
                      "category",
                      "thumbnail",
                      "price",
                      "mrp",
                      "stock",
                    ].map((k) => (
                      <label key={k}>
                        {k === "mrp"
                          ? "MRP (₹)"
                          : k === "price"
                            ? "Price (₹)"
                            : k}
                        <input
                          name={k}
                          readOnly={k === "stock" && !!editing.id}
                          required
                          type={
                            ["price", "mrp", "stock"].includes(k)
                              ? "number"
                              : "text"
                          }
                          defaultValue={
                            ["price", "mrp"].includes(k)
                              ? (editing[k] ?? 0) / 100
                              : (editing[k] ?? "")
                          }
                          min={k === "stock" ? 0 : undefined}
                        />
                      </label>
                    ))}
                  </div>
                  {editing.id && (
                    <p className="subtext">
                      Use Inventory to adjust available stock. Product edits
                      preserve current quantities.
                    </p>
                  )}
                  <label>
                    Description
                    <textarea
                      name="description"
                      required
                      minLength={10}
                      defaultValue={editing.description ?? ""}
                    />
                  </label>
                  <label>
                    Status
                    <select
                      name="status"
                      defaultValue={editing.status ?? "draft"}
                    >
                      <option>draft</option>
                      <option>active</option>
                      <option>archived</option>
                    </select>
                  </label>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      name="demo"
                      defaultChecked={editing.demo ?? false}
                    />
                    Sample product (cannot be purchased)
                  </label>
                </>
              ) : section === "inventory" ? (
                <label>
                  Available stock
                  <input
                    name="stock"
                    type="number"
                    min="0"
                    required
                    defaultValue={editing.stock}
                  />
                </label>
              ) : (
                <>
                  <p className="subtext">
                    Edit the structured record. Changes are validated and logged
                    server-side.
                  </p>
                  <label>
                    Record data
                    <textarea
                      className="json-editor"
                      name="json"
                      defaultValue={JSON.stringify(
                        editorData(section, editing),
                        null,
                        2,
                      )}
                    />
                  </label>
                </>
              )}
              {saveError && <p className="error-text">{saveError}</p>}
              <button
                disabled={
                  saving ||
                  [
                    "payments",
                    "returns",
                    "refunds",
                    "sellers",
                    "security",
                    "logs",
                    "notifications",
                    "admins",
                  ].includes(section)
                }
                className="button gold"
              >
                {[
                  "payments",
                  "returns",
                  "refunds",
                  "sellers",
                  "security",
                  "logs",
                  "notifications",
                  "admins",
                ].includes(section)
                  ? "Read-only record"
                  : saving
                    ? "Saving…"
                    : "Save changes"}
              </button>
            </form>
          )
        )}
      </Modal>
    </div>
  );
}
function editorData(section: string, e: any) {
  if (section === "orders")
    return { status: e.status, tracking: "", courier: "" };
  if (section === "customers") return { status: e.status };
  if (section === "reviews") return { status: e.status };
  if (section === "questions") return { answer: e.answer ?? "" };
  if (section === "support") return { message: "", status: e.status };
  if (section === "coupons")
    return {
      ...{
        code: "",
        kind: "percent",
        value: 10,
        minimum: 99900,
        maximum: 100000,
        remaining: 100,
        expiresAt: Date.now() + 30 * 86400000,
        active: true,
      },
      ...e,
      active: !!(e.active ?? true),
    };
  if (
    ["categories", "brands", "promotions", "banners", "homepage"].includes(
      section,
    )
  )
    return {
      title: e.title ?? "",
      position: e.position ?? 0,
      active: !!(e.active ?? true),
      data: e.data ? JSON.parse(e.data) : {},
    };
  return e;
}
function MfaVerify() {
  const s = useStore();
  const [error, setError] = useState("");
  const [factors, setFactors] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (s.user?.role === "admin")
      api("/api/auth/factors", {})
        .then((d) => setFactors(d.factors))
        .catch((e) => setError(e.message));
  }, [s.user?.id]);
  return (
    <form
      className="panel"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        try {
          await api("/api/auth/mfa-verify", {
            factorId: f.get("factorId"),
            code: f.get("code"),
          });
          location.href = "/admin";
        } catch (e) {
          setError((e as Error).message);
        }
      }}
    >
      <h3>Administrator verification</h3>
      <p className="subtext">
        After signing in, choose your authenticator and enter its current code.
        Enrollment is available under Account → Login & security.
      </p>
      <label>
        Authenticator
        <select name="factorId" required>
          {factors.length ? (
            factors.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))
          ) : (
            <option value="">Sign in with your admin account first</option>
          )}
        </select>
      </label>
      <label>
        Authenticator code
        <input name="code" required pattern="[0-9]{6}" />
      </label>
      {error && <p className="error-text">{error}</p>}
      <button className="button" disabled={!s.authReady || !factors.length}>
        Verify administrator
      </button>
    </form>
  );
}
