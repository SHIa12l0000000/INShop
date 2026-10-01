"use client";
import { useEffect, useState } from "react";
import {
  Package,
  Heart,
  MapPin,
  ShieldCheck,
  MessageCircle,
  UserRound,
  Bell,
  ArrowRight,
} from "lucide-react";
import { useStore, api } from "./store-provider";
import { money } from "../lib/types";
import { Empty, Modal } from "./ui";
import AuthForm from "./auth-form";
import { AddressForm } from "./checkout";
import { Wishlist } from "./cart";
export default function Account({ route }: { route: string }) {
  const s = useStore();
  const section = route.split("/")[2] ?? "profile";
  const reference = route.split("/")[3];
  const [rows, setRows] = useState<any[]>([]),
    [error, setError] = useState(""),
    [adding, setAdding] = useState(false),
    [editingAddress, setEditingAddress] = useState<any>(null),
    [reason, setReason] = useState(""),
    [search, setSearch] = useState(""),
    [mfa, setMfa] = useState<any>(null);
  const load = () => {
    if (
      ["orders", "addresses", "reviews", "notifications", "tickets"].includes(
        section,
      )
    )
      api("/api/store/" + section + (reference ? "/" + reference : ""))
        .then((d) => setRows(d.rows))
        .catch((e) => setError(e.message));
  };
  useEffect(() => {
    if (s.user) load();
  }, [section, reference, s.user]);
  if (!s.user)
    return (
      <div className="auth-page">
        <AuthForm />
      </div>
    );
  const actions = [
    ["profile", "Profile", UserRound],
    ["orders", "Orders", Package],
    ["wishlist", "Wishlist", Heart],
    ["addresses", "Addresses", MapPin],
    ["reviews", "Reviews", MessageCircle],
    ["notifications", "Notifications", Bell],
    ["tickets", "Support tickets", MessageCircle],
    ["security", "Login & security", ShieldCheck],
  ] as const;
  return (
    <div className="account-layout">
      <aside className="account-menu">
        <div className="avatar">{s.user.name.slice(0, 1)}</div>
        <h3>Hello, {s.user.name.split(" ")[0]}</h3>
        <p>{s.user.email}</p>
        {actions.map(([slug, label, Icon]) => (
          <a
            className={section === slug ? "active" : ""}
            key={slug}
            href={"/account/" + slug}
          >
            <Icon size={18} />
            {label}
          </a>
        ))}
        <a href="/help">
          <MessageCircle size={18} />
          Customer support
        </a>
        <button
          onClick={() =>
            api("/api/auth/logout", {})
              .then(() => (location.href = "/"))
              .catch((e) => s.notify(e.message))
          }
        >
          Sign out
        </button>
      </aside>
      <section className="account-main">
        <div className="page-heading">
          <span className="eyebrow">YOUR INSHOP</span>
          <h1>
            {actions.find((a) => a[0] === section)?.[1] ?? "Your account"}
          </h1>
        </div>
        {error && <p className="error-text">{error}</p>}
        {section === "wishlist" ? (
          <Wishlist />
        ) : section === "profile" ? (
          <div className="panel">
            <h2>A little about you</h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await api("/api/store/profile", {
                    name: new FormData(e.currentTarget).get("name"),
                  });
                  s.notify("Profile updated");
                } catch (e) {
                  s.notify((e as Error).message);
                }
              }}
            >
              <label>
                Full name
                <input
                  name="name"
                  defaultValue={s.user.name}
                  required
                  minLength={2}
                />
              </label>
              <label>
                Email
                <input value={s.user.email} disabled />
              </label>
              <button className="button">Save changes</button>
            </form>
            <a className="text-link space-top" href="/api/store/export">
              Download your personal data
            </a>
          </div>
        ) : section === "addresses" ? (
          <>
            <button
              className="button"
              onClick={() => {
                setEditingAddress(null);
                setAdding(true);
              }}
            >
              + Add address
            </button>
            <div className="address-list">
              {rows.map((r) => {
                const a = JSON.parse(r.data);
                return (
                  <div className="panel" key={r.id}>
                    <span className="badge">
                      {a.type}
                      {r.is_default ? " · Default" : ""}
                    </span>
                    <h3>{a.name}</h3>
                    <p>
                      {a.street}, {a.area}
                    </p>
                    <p>
                      {a.city}, {a.state} {a.pin}
                    </p>
                    <p>{a.phone}</p>
                    <div className="row-actions">
                      <button
                        className="text-link"
                        onClick={() => {
                          setEditingAddress(r);
                          setAdding(true);
                        }}
                      >
                        Edit
                      </button>
                      {!r.is_default && (
                        <button
                          className="text-link"
                          onClick={() =>
                            api("/api/store/addresses/" + r.id + "/default", {})
                              .then(load)
                              .catch((e) => s.notify(e.message))
                          }
                        >
                          Set as default
                        </button>
                      )}
                    </div>
                    <button
                      className="text-link"
                      onClick={() => {
                        if (confirm("Remove this saved address?"))
                          api("/api/store/addresses/" + r.id + "/delete", {})
                            .then(load)
                            .catch((e) => s.notify(e.message));
                      }}
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>
            <Modal
              title={
                editingAddress
                  ? "Edit delivery address"
                  : "Add a delivery address"
              }
              open={adding}
              close={() => setAdding(false)}
            >
              <AddressForm
                key={editingAddress?.id ?? "new"}
                initial={
                  editingAddress ? JSON.parse(editingAddress.data) : undefined
                }
                onSubmit={async (v) => {
                  try {
                    await api(
                      "/api/store/addresses" +
                        (editingAddress ? "/" + editingAddress.id : ""),
                      v,
                    );
                    setAdding(false);
                    load();
                    s.notify("Address saved");
                  } catch (e) {
                    s.notify((e as Error).message);
                  }
                }}
              />
            </Modal>
          </>
        ) : section === "orders" ? (
          rows.length ? (
            <>
              <input
                className="table-search"
                placeholder="Search orders"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {rows
                .filter((r) =>
                  (r.reference + " " + r.status)
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .map((o) => {
                  const d = JSON.parse(o.data);
                  return (
                    <article className="order-card" key={o.id}>
                      <div className="order-top">
                        <span>
                          <small>ORDER PLACED</small>
                          {new Date(o.created_at).toLocaleDateString("en-IN")}
                        </span>
                        <span>
                          <small>TOTAL</small>
                          {money(o.total)}
                        </span>
                        <span>
                          <small>ORDER</small>
                          {o.reference}
                        </span>
                        <span className="badge">
                          {o.status.replaceAll("-", " ")}
                        </span>
                      </div>
                      {d.items.map((p: any) => (
                        <div className="order-item" key={p.id}>
                          <img src={p.image} alt="" />
                          <div>
                            <h3>{p.title}</h3>
                            <p>
                              Qty {p.quantity} · {money(p.price)}
                            </p>
                          </div>
                          <button
                            className="button secondary"
                            onClick={() => s.add(p.id, p.quantity)}
                          >
                            Buy again
                          </button>
                        </div>
                      ))}
                      {reference ? (
                        <>
                          <div className="timeline">
                            {[
                              "placed",
                              "processing",
                              "packed",
                              "shipped",
                              "out-for-delivery",
                              "delivered",
                            ].map((status, i) => (
                              <div
                                className={
                                  [
                                    "placed",
                                    "processing",
                                    "packed",
                                    "shipped",
                                    "out-for-delivery",
                                    "delivered",
                                  ].indexOf(o.status) >= i
                                    ? "complete"
                                    : ""
                                }
                                key={status}
                              >
                                <i />
                                {status.replaceAll("-", " ")}
                              </div>
                            ))}
                          </div>
                          <p>
                            Payment: {o.payment_status} · {o.method}
                          </p>
                          <p>
                            Deliver to: {d.address.name}, {d.address.street},{" "}
                            {d.address.city} {d.address.pin}
                          </p>
                          {d.tracking && (
                            <p>
                              {d.courier}: {d.tracking}
                            </p>
                          )}
                          <div className="row-actions">
                            {o.method === "razorpay" &&
                              o.payment_status === "pending" && (
                                <button
                                  className="button secondary"
                                  onClick={() =>
                                    api("/api/payments/reconcile", {
                                      orderId: o.id,
                                    })
                                      .then(() => {
                                        load();
                                        s.notify("Payment status refreshed");
                                      })
                                      .catch((e) => s.notify(e.message))
                                  }
                                >
                                  Check payment status
                                </button>
                              )}
                            <button
                              className="button secondary"
                              onClick={() => window.print()}
                            >
                              Print order receipt
                            </button>
                            {["placed", "processing"].includes(o.status) && (
                              <button
                                className="button secondary"
                                onClick={() => {
                                  if (confirm("Cancel this order?"))
                                    api(
                                      "/api/store/orders/" + o.id + "/cancel",
                                      { reason: "Customer request" },
                                    )
                                      .then(() => {
                                        load();
                                        s.notify("Order cancelled");
                                      })
                                      .catch((e) => s.notify(e.message));
                                }}
                              >
                                Cancel order
                              </button>
                            )}
                            {o.status === "delivered" && (
                              <button
                                className="button secondary"
                                onClick={() => setAdding(true)}
                              >
                                Request a return
                              </button>
                            )}
                          </div>
                          <Modal
                            title="Request a return"
                            open={adding}
                            close={() => setAdding(false)}
                          >
                            <form
                              onSubmit={async (e) => {
                                e.preventDefault();
                                try {
                                  await api(
                                    "/api/store/orders/" + o.id + "/return",
                                    { reason, type: "Refund" },
                                  );
                                  setAdding(false);
                                  load();
                                  s.notify("Return request submitted");
                                } catch (e) {
                                  s.notify((e as Error).message);
                                }
                              }}
                            >
                              <label>
                                Tell us what went wrong
                                <textarea
                                  value={reason}
                                  minLength={10}
                                  required
                                  onChange={(e) => setReason(e.target.value)}
                                />
                              </label>
                              <button className="button">Request refund</button>
                            </form>
                          </Modal>
                        </>
                      ) : (
                        <a
                          className="text-link"
                          href={"/account/orders/" + o.reference}
                        >
                          View order & tracking <ArrowRight size={16} />
                        </a>
                      )}
                    </article>
                  );
                })}
            </>
          ) : (
            <Empty title="You haven’t placed an order yet." />
          )
        ) : section === "security" && s.user.provider === "site" ? (
          <div className="panel">
            <h2>Login & security</h2>
            <p>
              You signed in through ChatGPT. Manage your password, authenticator
              and login sessions in that account.
            </p>
            <button
              className="button secondary"
              onClick={() =>
                api("/api/auth/logout", {})
                  .then(() => {
                    location.href = "/login";
                  })
                  .catch((e) => s.notify(e.message))
              }
            >
              Sign out of INShop
            </button>
            <a
              className="text-link space-top"
              href="/signout-with-chatgpt?return_to=%2F"
              target="_top"
            >
              Sign out of ChatGPT on this site
            </a>
            <p className="subtext space-top">
              Use the Help Center to submit an account deletion request.
            </p>
          </div>
        ) : section === "security" ? (
          <div className="panel">
            <h2>Login & security</h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await api("/api/auth/password", {
                    password: new FormData(e.currentTarget).get("password"),
                  });
                  s.notify("Password updated");
                } catch (e) {
                  s.notify((e as Error).message);
                }
              }}
            >
              <label>
                New password
                <input
                  name="password"
                  type="password"
                  minLength={8}
                  required
                  autoComplete="new-password"
                />
              </label>
              <p className="subtext">
                Use uppercase, lowercase, a number and a symbol.
              </p>
              <button className="button">Change password</button>
            </form>
            <h3 className="space-top">Two-factor authentication</h3>
            <button
              className="button secondary"
              onClick={() =>
                api("/api/auth/mfa-enroll", {})
                  .then(setMfa)
                  .catch((e) => s.notify(e.message))
              }
            >
              Set up authenticator
            </button>
            {mfa && (
              <>
                <img
                  src={mfa.totp.qr_code}
                  alt="Scan with your authenticator app"
                />
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    api("/api/auth/mfa-verify", {
                      factorId: mfa.id,
                      code: new FormData(e.currentTarget).get("code"),
                    })
                      .then(() => {
                        setMfa(null);
                        s.notify("Two-factor authentication enabled");
                      })
                      .catch((e) => s.notify(e.message));
                  }}
                >
                  <label>
                    Authenticator code
                    <input name="code" required pattern="[0-9]{6}" />
                  </label>
                  <button className="button">Verify & enable</button>
                </form>
              </>
            )}
            <button
              className="text-link space-top"
              onClick={() =>
                api("/api/auth/logout", {}).then(
                  () => (location.href = "/login"),
                )
              }
            >
              Sign out of all sessions
            </button>
            <p className="subtext space-top">
              For account deletion, submit a verified request through the Help
              Center.
            </p>
          </div>
        ) : section === "tickets" && rows.length ? (
          rows.map((r) => (
            <div className="panel" key={r.id}>
              <h3>{r.subject}</h3>
              <p className="subtext">
                {r.category} · {r.status} · Ticket{" "}
                {r.id.slice(0, 8).toUpperCase()}
              </p>
              <div className="ticket-messages">
                {JSON.parse(r.messages).map((m: any, i: number) => (
                  <blockquote key={i}>
                    <strong>{m.from}</strong>
                    <p>{m.body}</p>
                    <small>{new Date(m.at).toLocaleString("en-IN")}</small>
                  </blockquote>
                ))}
              </div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  try {
                    await api("/api/store/tickets/" + r.id + "/reply", {
                      message: new FormData(form).get("message"),
                    });
                    form.reset();
                    load();
                  } catch (e) {
                    s.notify((e as Error).message);
                  }
                }}
              >
                <label>
                  Reply
                  <textarea
                    name="message"
                    required
                    minLength={2}
                    maxLength={5000}
                  />
                </label>
                <button className="button">Send reply</button>
              </form>
            </div>
          ))
        ) : rows.length ? (
          rows.map((r) => (
            <div className="panel" key={r.id}>
              <h3>{r.title ?? r.subject ?? "Your review"}</h3>
              <p>{r.body ?? r.status}</p>
              {section === "reviews" && (
                <button
                  className="text-link"
                  onClick={() => {
                    if (confirm("Delete your review?"))
                      api("/api/store/reviews/" + r.id + "/delete", {})
                        .then(load)
                        .catch((e) => s.notify(e.message));
                  }}
                >
                  Delete review
                </button>
              )}
              {r.href && (
                <a className="text-link" href={r.href}>
                  View details
                </a>
              )}
            </div>
          ))
        ) : (
          <Empty
            title="You’re all caught up."
            body="Your activity will appear here."
          />
        )}
      </section>
    </div>
  );
}
