"use client";
import { useState, useEffect } from "react";
import {
  Minus,
  Plus,
  Trash2,
  Heart,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";
import { useStore, api } from "./store-provider";
import { money } from "../lib/types";
import { Empty, ProductCard } from "./ui";
export default function Cart() {
  const s = useStore();
  const [coupon, setCoupon] = useState(""),
    [discount, setDiscount] = useState(0),
    [error, setError] = useState("");
  useEffect(() => setDiscount(0), [s.cart]);
  const rows = s.cart
    .map((l) => ({ line: l, p: s.products.find((p) => p.id === l.id) }))
    .filter((x) => x.p);
  const subtotal = rows.reduce(
    (t, { line, p }) => t + p!.price * line.quantity,
    0,
  );
  const shipping =
    subtotal >= (s.settings.freeOver ?? 99900)
      ? 0
      : (s.settings.shippingFee ?? 4900);
  if (!s.cart.length && !s.loading)
    return (
      <Empty
        title="Your cart is waiting."
        body="Good finds belong here. Let’s discover something you love."
      />
    );
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">GOOD CHOICES, ALL TOGETHER</span>
        <h1>
          Your shopping cart <span>({s.cart.length})</span>
        </h1>
        <p>
          Your finds are saved on this device
          {!s.user ? ". Sign in to keep them across devices." : "."}
        </p>
      </div>
      <div className="cart-layout">
        <div>
          <div className="shipping-progress">
            <span>
              {subtotal >= 99900
                ? "Your cart qualifies for free standard delivery."
                : "Add " +
                  money(99900 - subtotal) +
                  " more for free standard delivery."}
            </span>
            <div>
              <i
                style={{ width: Math.min(100, (subtotal / 99900) * 100) + "%" }}
              />
            </div>
          </div>
          {rows.map(
            ({ p, line }) =>
              p && (
                <article className="cart-item" key={p.id}>
                  <a href={"/product/" + p.slug}>
                    <img src={p.thumbnail} alt={p.title} />
                  </a>
                  <div>
                    <span className="muted">{p.brand}</span>
                    <a href={"/product/" + p.slug}>
                      <h3>{p.title}</h3>
                    </a>
                    <p className="subtext">Standard · Sold by {p.seller}</p>
                    <span className="in-stock">
                      {p.stock > 0 ? "In stock" : "Out of stock"}
                    </span>
                    <div className="cart-item-actions">
                      <div className="quantity">
                        <button
                          aria-label={"Decrease " + p.title}
                          onClick={() => s.quantity(p.id, line.quantity - 1)}
                        >
                          <Minus size={14} />
                        </button>
                        <span>{line.quantity}</span>
                        <button
                          aria-label={"Increase " + p.title}
                          onClick={() => s.quantity(p.id, line.quantity + 1)}
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                      <button
                        onClick={() => s.quantity(p.id, 0)}
                        aria-label={"Remove " + p.title}
                      >
                        <Trash2 size={15} />
                        Remove
                      </button>
                      <button
                        onClick={() => {
                          s.wish(p.id);
                          s.quantity(p.id, 0);
                        }}
                      >
                        <Heart size={15} />
                        Save for later
                      </button>
                    </div>
                  </div>
                  <div className="cart-item-price">
                    <strong>{money(p.price * line.quantity)}</strong>
                    <del>{money(p.mrp * line.quantity)}</del>
                  </div>
                </article>
              ),
          )}
        </div>
        <aside className="order-summary">
          <h2>Order summary</h2>
          <div>
            <span>
              Subtotal ({s.cart.reduce((a, b) => a + b.quantity, 0)} items)
            </span>
            <b>{money(subtotal)}</b>
          </div>
          <div>
            <span>Delivery</span>
            <b>{shipping ? money(shipping) : "FREE"}</b>
          </div>
          {discount > 0 && (
            <div className="in-stock">
              <span>Coupon savings</span>
              <b>−{money(discount)}</b>
            </div>
          )}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const d = await api("/api/store/coupon", {
                  code: coupon,
                  items: s.cart,
                });
                setDiscount(d.discount);
                setError("");
                sessionStorage.setItem("inshop-coupon", coupon);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <label htmlFor="coupon">Have a coupon?</label>
            <div className="inline-input">
              <input
                id="coupon"
                value={coupon}
                onChange={(e) => setCoupon(e.target.value.toUpperCase())}
                placeholder="Enter code"
              />
              <button>Apply</button>
            </div>
            {error && <p className="error-text">{error}</p>}
          </form>
          <div className="summary-total">
            <span>Total</span>
            <b>{money(subtotal + shipping - discount)}</b>
          </div>
          <p className="subtext">
            Taxes included where applicable. Final total is calculated securely
            at checkout.
          </p>
          <a className="button gold" href="/checkout">
            Proceed to checkout <ArrowRight size={17} />
          </a>
          <p className="trust-line">
            <ShieldCheck size={15} />
            Your payment details stay protected
          </p>
          <a className="text-link" href="/search">
            Continue shopping
          </a>
        </aside>
      </div>
    </>
  );
}
export function Wishlist() {
  const s = useStore();
  const [name, setName] = useState("My Wishlist"),
    [lists, setLists] = useState<any[]>([]),
    [selected, setSelected] = useState("");
  useEffect(() => {
    if (s.user)
      api("/api/store/wishlists")
        .then((d) => setLists(d.rows))
        .catch(() => {});
  }, [s.user]);
  const ids = selected
    ? JSON.parse(lists.find((l) => l.id === selected)?.data ?? "[]")
    : s.wishlist;
  const ps = s.products.filter((p) => ids.includes(p.id));
  return (
    <>
      <div className="page-heading">
        <div className="eyebrow">KEEP THE GOOD FINDS CLOSE</div>
        <h1>{name}</h1>
        <p>Save products you love and find them here.</p>
      </div>
      <div className="wishlist-toolbar">
        <label>
          List name
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        {lists.length > 0 && (
          <label>
            Saved lists
            <select
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                setName(
                  lists.find((l) => l.id === e.target.value)?.name ??
                    "My Wishlist",
                );
              }}
            >
              <option value="">This device</option>
              {lists.map((l) => (
                <option value={l.id} key={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          className="button secondary"
          onClick={async () => {
            if (!s.user) {
              location.href = "/login";
              return;
            }
            try {
              await api("/api/store/wishlists", {
                name,
                items: ids,
                ...(selected ? { id: selected } : {}),
              });
              const d = await api("/api/store/wishlists");
              setLists(d.rows);
              s.notify("Wishlist saved to your account");
            } catch (e) {
              s.notify((e as Error).message);
            }
          }}
        >
          Save list to account
        </button>
        {selected && (
          <button
            className="button secondary"
            onClick={() =>
              navigator.clipboard
                .writeText(
                  location.origin +
                    "/wishlist/shared/" +
                    lists.find((l) => l.id === selected).share_token,
                )
                .then(() => s.notify("Share link copied"))
            }
          >
            Share list
          </button>
        )}
      </div>
      {ps.length ? (
        <div className="products">
          {ps.map((p) => (
            <ProductCard product={p} key={p.id} />
          ))}
        </div>
      ) : (
        <Empty
          title="Your next favourites belong here."
          body="Tap the heart on any product to save it for later."
        />
      )}
    </>
  );
}
export function Compare() {
  const s = useStore();
  const ps = s.products.filter((p) => s.compare.includes(p.id));
  if (!ps.length)
    return (
      <Empty
        title="Find your perfect match."
        body="Choose up to four products using the compare icon on any product card."
      />
    );
  return (
    <>
      <div className="page-heading">
        <h1>Compare your favourites</h1>
        <p>The details, side by side.</p>
      </div>
      <div className="table-scroll">
        <table className="compare-table">
          <thead>
            <tr>
              <th>Product</th>
              {ps.map((p) => (
                <th key={p.id}>
                  <img src={p.thumbnail} alt={p.title} />
                  <a href={"/product/" + p.slug}>{p.title}</a>
                  <button
                    className="text-link"
                    onClick={() => s.compareToggle(p.id)}
                  >
                    Remove
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {["Price", "Brand", "Rating", "Warranty", "Availability"].map(
              (k) => (
                <tr key={k}>
                  <th>{k}</th>
                  {ps.map((p) => (
                    <td key={p.id}>
                      {k === "Price"
                        ? money(p.price)
                        : k === "Brand"
                          ? p.brand
                          : k === "Rating"
                            ? p.rating
                            : k === "Warranty"
                              ? p.specs.Warranty
                              : p.stock
                                ? "In stock"
                                : "Out of stock"}
                    </td>
                  ))}
                </tr>
              ),
            )}
            <tr>
              <th>Ready to choose?</th>
              {ps.map((p) => (
                <td key={p.id}>
                  <button className="button gold" onClick={() => s.add(p.id)}>
                    Add to cart
                  </button>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
