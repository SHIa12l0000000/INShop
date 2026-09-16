"use client";
import { useState } from "react";
import {
  Search,
  Package,
  CreditCard,
  RotateCcw,
  UserRound,
  Truck,
  MessageCircle,
} from "lucide-react";
import { useStore, api } from "./store-provider";
export default function Help() {
  const s = useStore();
  const [query, setQuery] = useState(""),
    [success, setSuccess] = useState(""),
    [error, setError] = useState("");
  const faqs = [
    [
      "How do I track my order?",
      "Open Account → Orders, select your order and view the tracking timeline. Courier details appear once the store dispatches your parcel.",
    ],
    [
      "What payment methods are supported?",
      "Once the store connects Razorpay, eligible orders can use UPI, cards, net banking and wallets. Cash on delivery is available only when enabled by the store.",
    ],
    [
      "How do I request a return?",
      "Open a delivered order and choose Request a return. Explain the issue so support can review your request under the product’s applicable return policy.",
    ],
    [
      "Can I shop without an account?",
      "Yes. Browse, search, save a wishlist and add items to your guest cart. You need to sign in before checkout or using account features.",
    ],
    [
      "Why can’t I place an order yet?",
      "This store currently displays sample merchandise. The owner must connect authentication and payment services, add real inventory, and activate commerce before accepting orders.",
    ],
    [
      "How do I use a coupon?",
      "Enter the coupon code in your cart. Eligibility, minimum spend, availability and savings are checked by the server.",
    ],
    [
      "How are my card details stored?",
      "INShop does not store card numbers. Payments are handled by the configured payment provider.",
    ],
  ];
  return (
    <>
      <div className="help-hero">
        <span className="eyebrow">A LITTLE HELP GOES A LONG WAY</span>
        <h1>How can we help?</h1>
        <div className="help-search">
          <Search size={20} />
          <input
            aria-label="Search help"
            placeholder="Search orders, payments, returns…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      <div className="help-topics">
        {[
          ["Orders", Package],
          ["Payments", CreditCard],
          ["Returns", RotateCcw],
          ["Account", UserRound],
          ["Shipping", Truck],
          ["Other", MessageCircle],
        ].map(([label, Icon]: any) => (
          <button key={label} onClick={() => setQuery(label)}>
            <Icon />
            <h3>{label}</h3>
          </button>
        ))}
      </div>
      <div className="help-layout">
        <section>
          <h2>Frequently asked questions</h2>
          {faqs
            .filter(([q, a]) =>
              (q + a)
                .toLowerCase()
                .includes(query.toLowerCase().replace("shipping", "parcel")),
            )
            .map(([q, a]) => (
              <details className="faq" key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
        </section>
        <section className="panel">
          <h2>Let’s sort it out.</h2>
          <p className="subtext">
            Send a support ticket. Your conversation stays in your account.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              const f = new FormData(e.currentTarget);
              try {
                await api("/api/store/tickets", {
                  subject: f.get("subject"),
                  category: f.get("category"),
                  message: f.get("message"),
                });
                setSuccess("Your support ticket has been created.");
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <label>
              Subject
              <input name="subject" required minLength={5} />
            </label>
            <label>
              Category
              <select name="category">
                {[
                  "Orders",
                  "Payments",
                  "Returns",
                  "Account",
                  "Shipping",
                  "Other",
                ].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              How can we help?
              <textarea name="message" required minLength={20} />
            </label>
            {error && <p className="error-text">{error}</p>}
            {success && <p className="success-message">{success}</p>}
            <button className="button gold">Create support ticket</button>
            {!s.user && (
              <p className="subtext">
                Please{" "}
                <a className="text-link" href="/login">
                  sign in
                </a>{" "}
                to create a ticket.
              </p>
            )}
          </form>
        </section>
      </div>
    </>
  );
}
