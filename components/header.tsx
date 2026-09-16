"use client";
import { useEffect, useState } from "react";
import {
  Search,
  ShoppingBag,
  Heart,
  MapPin,
  Menu,
  Bell,
  UserRound,
  House,
  Grid2X2,
  Sun,
  Moon,
  Monitor,
  ChevronDown,
} from "lucide-react";
import { useStore, api } from "./store-provider";
import { Modal } from "./ui";
export function Header() {
  const s = useStore();
  const [q, setQ] = useState(""),
    [suggest, setSuggest] = useState(false),
    [location, setLocation] = useState(false),
    [pin, setPin] = useState(s.pin),
    [pinError, setPinError] = useState(""),
    [notifications, setNotifications] = useState(false),
    [messages, setMessages] = useState<any[]>([]),
    [theme, setTheme] = useState("system");
  useEffect(() => {
    const t = localStorage.getItem("inshop-theme") ?? "system";
    setTheme(t);
    document.documentElement.dataset.theme =
      t === "system"
        ? matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : t;
  }, []);
  function changeTheme(t: string) {
    setTheme(t);
    localStorage.setItem("inshop-theme", t);
    document.documentElement.dataset.theme =
      t === "system"
        ? matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : t;
  }
  const suggestions = s.products
    .filter((p) =>
      (p.title + " " + p.brand + " " + p.category)
        .toLowerCase()
        .includes(q.toLowerCase()),
    )
    .slice(0, 5);
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="announcement">
        A little more joy. A lot more value.{" "}
        <b>Discover your next favourite →</b>
        <span>Sample catalog · Checkout opens after store setup</span>
      </div>
      <header>
        <a className="logo" href="/">
          <img src="/favicon.svg" width="35" height="35" alt="" />
          INShop
        </a>
        <button
          className="location"
          onClick={() => {
            setPin(s.pin);
            setLocation(true);
          }}
        >
          <MapPin size={18} />
          <span>
            Delivering to
            <strong>
              {s.pin === "201001" ? "Ghaziabad " : ""}
              {s.pin} <ChevronDown size={11} />
            </strong>
          </span>
        </button>
        <div className="search-wrap">
          <form className="search" action="/search">
            <select name="category" aria-label="Search category">
              <option value="">All</option>
              {Array.from(new Set(s.products.map((p) => p.category))).map(
                (c) => (
                  <option key={c}>{c}</option>
                ),
              )}
            </select>
            <input
              name="q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onFocus={() => setSuggest(true)}
              onBlur={() => setTimeout(() => setSuggest(false), 160)}
              aria-label="Search INShop"
              placeholder="Search INShop"
              autoComplete="off"
            />
            <button aria-label="Search">
              <Search size={21} />
            </button>
          </form>
          {suggest && q.length > 0 && (
            <div className="suggestions">
              {suggestions.length ? (
                suggestions.map((p) => (
                  <a href={"/product/" + p.slug} key={p.id}>
                    <img src={p.thumbnail} alt="" />
                    {p.title}
                  </a>
                ))
              ) : (
                <a href={"/search?q=" + encodeURIComponent(q)}>
                  Search for “{q}”
                </a>
              )}
            </div>
          )}
        </div>
        <a href={s.user ? "/account" : "/login"} className="account-link">
          Hello, {s.user ? s.user.name.split(" ")[0] : "sign in"}
          <b>
            Your account <ChevronDown size={11} />
          </b>
        </a>
        <button
          className="desktop-notify icon-btn"
          aria-label="Notifications"
          onClick={() => {
            setNotifications(true);
            if (s.user)
              api("/api/store/notifications")
                .then((d) => setMessages(d.rows))
                .catch((e) => s.notify(e.message));
          }}
        >
          <Bell size={21} />
        </button>
        <a className="icon-btn" href="/wishlist" aria-label="Wishlist">
          <Heart size={23} />
        </a>
        <a
          className="cart-link icon-btn"
          href="/cart"
          aria-label={
            "Cart, " + s.cart.reduce((a, b) => a + b.quantity, 0) + " items"
          }
        >
          <ShoppingBag size={23} />
          <span>{s.cart.reduce((a, b) => a + b.quantity, 0)}</span>
        </a>
      </header>
      <nav>
        <a href="/categories">
          <Menu size={17} /> All categories
        </a>
        {[
          "Electronics",
          "Mobiles",
          "Fashion",
          "Home & Living",
          "Kitchen",
          "Beauty",
          "Sports",
          "Grocery",
        ].map((n) => (
          <a
            key={n}
            href={"/category/" + n.toLowerCase().replace(/[^a-z0-9]+/g, "-")}
          >
            {n}
          </a>
        ))}
        <a className="accent" href="/deals">
          Today’s deals
        </a>
      </nav>
      <Modal
        open={location}
        close={() => setLocation(false)}
        title="Where should we deliver?"
      >
        <p className="subtext">
          Enter your PIN code to check delivery options. Final availability is
          confirmed at checkout.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!/^\d{6}$/.test(pin)) {
              setPinError("Enter a valid 6-digit PIN code.");
              return;
            }
            s.setPin(pin);
            setLocation(false);
            s.notify("Delivery location updated");
          }}
        >
          <label>
            Delivery PIN code
            <input
              value={pin}
              inputMode="numeric"
              maxLength={6}
              onChange={(e) => setPin(e.target.value)}
              placeholder="201001"
            />
          </label>
          {pinError && <p className="error-text">{pinError}</p>}
          <button className="button">Apply location</button>
        </form>
        <a className="text-link" href="/account/addresses">
          Choose a saved address
        </a>
      </Modal>
      <Modal
        open={notifications}
        close={() => setNotifications(false)}
        title="Notifications"
      >
        {!s.user ? (
          <p>
            Sign in to see order updates and notifications.{" "}
            <a className="text-link" href="/login">
              Sign in
            </a>
          </p>
        ) : messages.length ? (
          <>
            {messages.map((n) => (
              <a className="notice-item" key={n.id} href={n.href}>
                {n.title}
              </a>
            ))}
            <button
              className="button secondary"
              onClick={() =>
                api("/api/store/notifications", {}).then(() =>
                  s.notify("All notifications marked as read"),
                )
              }
            >
              Mark all as read
            </button>
          </>
        ) : (
          <p>You’re all caught up. Your updates will appear here.</p>
        )}
      </Modal>
      <div className="mobile-nav">
        <a href="/">
          <House />
          Home
        </a>
        <a href="/categories">
          <Grid2X2 />
          Categories
        </a>
        <a href="/search">
          <Search />
          Search
        </a>
        <a href="/cart">
          <ShoppingBag />
          Cart ({s.cart.length})
        </a>
        <a href="/account">
          <UserRound />
          Account
        </a>
      </div>
      <div className="theme-control" aria-label="Color theme">
        {[
          ["light", Sun],
          ["dark", Moon],
          ["system", Monitor],
        ].map(([t, Icon]: any) => (
          <button
            key={t}
            aria-label={t + " theme"}
            aria-pressed={theme === t}
            onClick={() => changeTheme(t)}
          >
            <Icon size={14} />
          </button>
        ))}
      </div>
    </>
  );
}
export function Footer() {
  return (
    <footer>
      <div className="footer-grid">
        <div>
          <a className="logo" href="/">
            <img src="/favicon.svg" alt="" width="36" />
            INShop
          </a>
          <p>
            Everything you need.
            <br />
            One smart shop.
          </p>
          <span className="footer-country">India · English · INR ₹</span>
        </div>
        {[
          [
            "Get to know us",
            ["About INShop", "about"],
            ["Contact us", "help"],
            ["Sell on INShop", "seller-policy"],
          ],
          [
            "Here to help",
            ["Help center", "help"],
            ["Your orders", "account/orders"],
            ["Shipping & delivery", "shipping-policy"],
            ["Returns & refunds", "return-policy"],
          ],
          [
            "Shop with confidence",
            ["Privacy policy", "privacy-policy"],
            ["Terms of use", "terms"],
            ["Cookie policy", "cookie-policy"],
            ["Acceptable use", "acceptable-use-policy"],
          ],
        ].map(([title, ...links]: any) => (
          <div key={title}>
            <h3>{title}</h3>
            {links.map(([text, path]: string[]) => (
              <a href={"/" + path} key={path}>
                {text}
              </a>
            ))}
          </div>
        ))}
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} INShop. All rights reserved.</span>
        <span>Sample merchandise and pricing for store preview.</span>
        <span>UPI · VISA · Mastercard · RuPay</span>
      </div>
    </footer>
  );
}
