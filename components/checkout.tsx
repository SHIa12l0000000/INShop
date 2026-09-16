"use client";
import { useState, useEffect } from "react";
import { useStore, api } from "./store-provider";
import { money, type CartLine } from "../lib/types";
import { Empty } from "./ui";
import AuthForm from "./auth-form";
export default function Checkout() {
  const s = useStore();
  const [step, setStep] = useState(1),
    [items, setItems] = useState<CartLine[]>([]),
    [address, setAddress] = useState<any>(null),
    [method, setMethod] = useState("razorpay"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [key] = useState(() => crypto.randomUUID());
  useEffect(() => {
    const direct = new URLSearchParams(location.search).get("buyNow");
    try {
      setItems(
        direct
          ? JSON.parse(sessionStorage.getItem("inshop-buy-now") ?? "[]")
          : s.cart,
      );
    } catch {
      setItems(s.cart);
    }
  }, [s.cart]);
  if (!s.user)
    return (
      <div className="auth-page">
        <AuthForm />
      </div>
    );
  if (!items.length)
    return (
      <Empty
        title="Your checkout is waiting."
        body="Add an item to your cart to get started."
      />
    );
  const ps = items.map((i) => ({
    ...i,
    product: s.products.find((p) => p.id === i.id),
  }));
  const subtotal = ps.reduce(
    (a, p) => a + (p.product?.price ?? 0) * p.quantity,
    0,
  );
  return (
    <>
      <div className="page-heading">
        <h1>A few steps to your next favourite.</h1>
      </div>
      <ol className="checkout-steps">
        {["Address", "Delivery", "Payment", "Review"].map((t, i) => (
          <li className={step >= i + 1 ? "active" : ""} key={t}>
            <span>{i + 1}</span>
            {t}
          </li>
        ))}
      </ol>
      <div className="checkout-layout">
        <section className="panel">
          {step === 1 ? (
            <>
              <h2>Where should we deliver?</h2>
              <AddressForm
                initial={address}
                onSubmit={(v) => {
                  setAddress(v);
                  setStep(2);
                }}
                button="Continue to delivery"
              />
            </>
          ) : step === 2 ? (
            <>
              <h2>Choose your delivery</h2>
              <label className="choice-card">
                <input type="radio" checked readOnly /> Standard delivery{" "}
                <strong>{subtotal >= 99900 ? "FREE" : "₹49"}</strong>
                <span>
                  Delivery estimate will be confirmed when the store opens.
                </span>
              </label>
              <button className="button" onClick={() => setStep(3)}>
                Continue to payment
              </button>
            </>
          ) : step === 3 ? (
            <>
              <h2>How would you like to pay?</h2>
              <label className="choice-card">
                <input
                  type="radio"
                  checked={method === "razorpay"}
                  onChange={() => setMethod("razorpay")}
                />
                UPI, cards, net banking & wallets
                <span>
                  Secure payment through Razorpay. INShop never stores your card
                  number.
                </span>
              </label>
              {s.settings.codEnabled && (
                <label className="choice-card">
                  <input
                    type="radio"
                    checked={method === "cod"}
                    onChange={() => setMethod("cod")}
                  />
                  Cash on delivery
                </label>
              )}
              <button className="button" onClick={() => setStep(4)}>
                Review order
              </button>
            </>
          ) : (
            <>
              <h2>Review your order</h2>
              <h3>Delivering to {address?.name}</h3>
              <p>
                {address?.street}, {address?.city}, {address?.state}{" "}
                {address?.pin}
              </p>
              <p>{address?.phone}</p>
              <h3 className="space-top">Payment method</h3>
              <p>
                {method === "cod"
                  ? "Cash on delivery"
                  : "Razorpay secure checkout"}
              </p>
              {!s.commerceReady && (
                <div className="setup-note">
                  INShop is displaying a sample catalog. Orders cannot be placed
                  until the owner adds real inventory and completes store setup.
                </div>
              )}
              <button
                className="button gold"
                disabled={busy || !s.commerceReady}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    const d = await api("/api/store/checkout", {
                      items,
                      address,
                      method,
                      coupon: sessionStorage.getItem("inshop-coupon") ?? "",
                      idempotencyKey: key,
                    });
                    if (method === "cod") {
                      s.clearCart();
                      location.href =
                        "/checkout/success?order=" + d.order.reference;
                      return;
                    }
                    const payment = await api("/api/payments/create", {
                      orderId: d.order.id,
                    });
                    const script = document.createElement("script");
                    script.src = "https://checkout.razorpay.com/v1/checkout.js";
                    script.onload = () => {
                      const Razorpay = (window as any).Razorpay;
                      new Razorpay({
                        ...payment,
                        prefill: {
                          name: s.user?.name,
                          email: s.user?.email,
                          contact: address.phone,
                        },
                        handler: () => {
                          location.href =
                            "/account/orders/" + d.order.reference;
                        },
                        modal: { ondismiss: () => setBusy(false) },
                        theme: { color: "#192d3f" },
                      }).open();
                    };
                    script.onerror = () => {
                      setError(
                        "Payment screen could not load. Your order remains unpaid.",
                      );
                      setBusy(false);
                    };
                    document.body.appendChild(script);
                  } catch (e) {
                    setError((e as Error).message);
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Preparing your order…" : "Place order"}
              </button>
            </>
          )}
          {step > 1 && (
            <button
              className="text-link space-top"
              onClick={() => setStep(step - 1)}
            >
              ← Back
            </button>
          )}
          {error && <p className="error-text">{error}</p>}
        </section>
        <aside className="order-summary">
          <h2>Your order</h2>
          {ps.map((p) => (
            <div key={p.id} className="checkout-item">
              <img src={p.product?.thumbnail} alt="" />
              <span>
                {p.product?.title}
                <small>Quantity {p.quantity}</small>
              </span>
              <b>{money((p.product?.price ?? 0) * p.quantity)}</b>
            </div>
          ))}
          <div className="summary-total">
            <span>Subtotal</span>
            <b>{money(subtotal)}</b>
          </div>
          <p className="subtext">
            Shipping and valid coupons are calculated by the server before
            payment.
          </p>
        </aside>
      </div>
    </>
  );
}
export function AddressForm({
  initial,
  onSubmit,
  button = "Save address",
}: {
  initial?: any;
  onSubmit: (v: any) => void;
  button?: string;
}) {
  return (
    <form
      className="address-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        onSubmit(Object.fromEntries(f.entries()));
      }}
    >
      <div className="form-grid">
        {[
          ["name", "Full name", "text"],
          ["phone", "Mobile number", "tel"],
          ["pin", "PIN code", "text"],
          ["street", "Flat / building / street", "text"],
          ["area", "Area / locality", "text"],
          ["landmark", "Landmark (optional)", "text"],
          ["city", "City", "text"],
          ["state", "State", "text"],
        ].map(([key, label, type]) => (
          <label key={key}>
            {label}
            <input
              name={key}
              type={type}
              defaultValue={initial?.[key] ?? ""}
              required={!["landmark", "area"].includes(key)}
              minLength={key === "street" ? 5 : undefined}
              pattern={
                key === "phone"
                  ? "[6-9][0-9]{9}"
                  : key === "pin"
                    ? "[0-9]{6}"
                    : undefined
              }
              maxLength={key === "phone" ? 10 : key === "pin" ? 6 : 200}
            />
          </label>
        ))}
      </div>
      <label>
        Address type
        <select name="type">
          <option>Home</option>
          <option>Work</option>
          <option>Other</option>
        </select>
      </label>
      <p className="subtext">Country: India</p>
      <button className="button gold">{button}</button>
    </form>
  );
}
