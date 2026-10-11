"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { Product, CartLine, User } from "../lib/types";

export async function api(path: string, body?: unknown): Promise<any> {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new Error("The store is temporarily unavailable. Please try again.");
  const data: any = await response.json();
  if (!response.ok)
    throw new Error(
      data.fields
        ?.map(
          (f: { field: string; message: string }) => f.field + ": " + f.message,
        )
        .join(" · ") ||
        data.error ||
        "Please try again.",
    );
  return data;
}
type Store = {
  products: Product[];
  cart: CartLine[];
  wishlist: string[];
  compare: string[];
  user: User | null;
  loading: boolean;
  sessionLoading: boolean;
  error: string;
  settings: Record<string, any>;
  banners: any[];
  authReady: boolean;
  googleAuthReady: boolean;
  emailDeliveryReady: boolean;
  siteAuthReady: boolean;
  commerceReady: boolean;
  notice: string;
  notify: (s: string) => void;
  add: (id: string, q?: number) => void;
  quantity: (id: string, q: number) => void;
  wish: (id: string) => void;
  compareToggle: (id: string) => void;
  clearCart: () => void;
  reload: () => Promise<void>;
  pin: string;
  setPin: (s: string) => void;
};
const Context = createContext<Store | null>(null);
function readLocal(key: string, fallback: any) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}
function validLines(value: unknown): CartLine[] {
  return Array.isArray(value)
    ? value
        .filter(
          (x) =>
            typeof x?.id === "string" &&
            Number.isInteger(x.quantity) &&
            x.quantity > 0 &&
            x.quantity <= 10,
        )
        .slice(0, 50)
    : [];
}
export function StoreProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]),
    [cart, setCart] = useState<CartLine[]>([]),
    [wishlist, setWishlist] = useState<string[]>([]),
    [compare, setCompare] = useState<string[]>([]),
    [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [settings, setSettings] = useState({}),
    [banners, setBanners] = useState<any[]>([]),
    [authReady, setAuthReady] = useState(false),
    [googleAuthReady, setGoogleAuthReady] = useState(false),
    [emailDeliveryReady, setEmailDeliveryReady] = useState(false),
    [siteAuthReady, setSiteAuthReady] = useState(false),
    [commerceReady, setCommerceReady] = useState(false),
    [notice, notify] = useState(""),
    [pin, setPinState] = useState("201001");
  const [ready, setReady] = useState(false),
    [accountReady, setAccountReady] = useState(false),
    [pendingGuest, setPendingGuest] = useState<CartLine[]>([]),
    [wishlistId, setWishlistId] = useState<string | undefined>();
  const reload = useCallback(async () => {
    try {
      const d = await api("/api/store/catalog");
      setProducts(d.products);
      setSettings(d.settings);
      setBanners(d.banners);
      setAuthReady(d.authConfigured);
      setGoogleAuthReady(d.googleAuthConfigured === true);
      setEmailDeliveryReady(d.emailDeliveryConfigured === true);
      setSiteAuthReady(d.siteAuthConfigured);
      setCommerceReady(d.commerceEnabled);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const saved = validLines(readLocal("inshop-cart", []));
    setCart(saved);
    const localWishlist = readLocal("inshop-wishlist", []);
    setWishlist(Array.isArray(localWishlist) ? localWishlist : []);
    const localCompare = readLocal("inshop-compare", []);
    setCompare(Array.isArray(localCompare) ? localCompare.slice(0, 4) : []);
    setPinState(localStorage.getItem("inshop-pin") ?? "201001");
    setReady(true);
    void reload();
    api("/api/store/session")
      .then(async (d) => {
        if (!d.user) {
          setAccountReady(true);
          return;
        }
        const [c, w] = await Promise.all([
          api("/api/store/cart"),
          api("/api/store/wishlists"),
        ]);
        setCart(validLines(c.items));
        setPendingGuest(saved);
        setUser(d.user);
        const defaultList = w.rows.find((l: any) => l.name === "My Wishlist");
        if (defaultList) {
          setWishlistId(defaultList.id);
          setWishlist(JSON.parse(defaultList.data));
        } else {
          const items = Array.isArray(localWishlist)
            ? localWishlist
                .filter((x: unknown) => typeof x === "string")
                .slice(0, 200)
            : [];
          const created = await api("/api/store/wishlists", {
            name: "My Wishlist",
            items,
          });
          setWishlistId(created.id);
          setWishlist(items);
        }
        setAccountReady(true);
      })
      .catch(() => {
        setAccountReady(true);
      });
  }, [reload]);
  useEffect(() => {
    if (!ready || !accountReady) return;
    if (user)
      api("/api/store/cart", { items: cart }).catch((e) => notify(e.message));
    else localStorage.setItem("inshop-cart", JSON.stringify(cart));
  }, [cart, user, ready, accountReady]);
  useEffect(() => {
    if (!ready || !accountReady) return;
    if (!user)
      localStorage.setItem("inshop-wishlist", JSON.stringify(wishlist));
    else if (wishlistId)
      api("/api/store/wishlists", {
        id: wishlistId,
        name: "My Wishlist",
        items: wishlist,
      }).catch((e) => notify(e.message));
  }, [wishlist, ready, user, accountReady, wishlistId]);
  useEffect(() => {
    if (ready) localStorage.setItem("inshop-compare", JSON.stringify(compare));
  }, [compare, ready]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => notify(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  function add(id: string, q = 1) {
    const p = products.find((p) => p.id === id);
    if (!p || p.stock < 1) {
      notify("This item is currently out of stock.");
      return;
    }
    setCart((c) => {
      const old = c.find((x) => x.id === id);
      return old
        ? c.map((x) =>
            x.id === id
              ? { ...x, quantity: Math.min(10, p.stock, x.quantity + q) }
              : x,
          )
        : [
            ...c,
            { id, variant: "standard", quantity: Math.min(q, 10, p.stock) },
          ];
    });
    notify("Added to your cart");
  }
  function quantity(id: string, q: number) {
    const p = products.find((p) => p.id === id);
    setCart((c) =>
      q <= 0
        ? c.filter((x) => x.id !== id)
        : c.map((x) =>
            x.id === id
              ? { ...x, quantity: Math.min(10, p?.stock ?? 10, q) }
              : x,
          ),
    );
  }
  function wish(id: string) {
    setWishlist((w) =>
      w.includes(id) ? w.filter((x) => x !== id) : [...w, id],
    );
    notify(
      wishlist.includes(id)
        ? "Removed from wishlist"
        : "Saved to your wishlist",
    );
  }
  function compareToggle(id: string) {
    setCompare((c) =>
      c.includes(id)
        ? c.filter((x) => x !== id)
        : c.length < 4
          ? [...c, id]
          : c,
    );
    if (compare.length >= 4 && !compare.includes(id))
      notify("Compare up to four products at a time.");
  }
  function mergeGuest() {
    setCart((current) => {
      const merged = current.map((x) => ({ ...x }));
      for (const line of pendingGuest) {
        const p = products.find((p) => p.id === line.id);
        if (!p?.stock) continue;
        const existing = merged.find(
          (x) => x.id === line.id && x.variant === line.variant,
        );
        if (existing)
          existing.quantity = Math.min(
            10,
            p.stock,
            existing.quantity + line.quantity,
          );
        else
          merged.push({
            ...line,
            quantity: Math.min(line.quantity, p.stock, 10),
          });
      }
      return merged.slice(0, 50);
    });
    setPendingGuest([]);
    localStorage.removeItem("inshop-cart");
    notify("Your guest cart has been merged.");
  }
  const setPin = (value: string) => {
    setPinState(value);
    localStorage.setItem("inshop-pin", value);
  };
  return (
    <Context.Provider
      value={{
        products,
        cart,
        wishlist,
        compare,
        user,
        loading,
        sessionLoading: !accountReady,
        error,
        settings,
        banners,
        authReady,
        googleAuthReady,
        emailDeliveryReady,
        siteAuthReady,
        commerceReady,
        notice,
        notify,
        add,
        quantity,
        wish,
        compareToggle,
        clearCart: () => setCart([]),
        reload,
        pin,
        setPin,
      }}
    >
      {children}
      {pendingGuest.length > 0 && (
        <div className="merge-banner" role="region" aria-label="Guest cart">
          <p>Merge guest cart with your INShop cart?</p>
          <button className="button gold" onClick={mergeGuest}>
            Merge {pendingGuest.length} items
          </button>
          <button
            onClick={() => {
              setPendingGuest([]);
              localStorage.removeItem("inshop-cart");
            }}
          >
            Keep account cart
          </button>
        </div>
      )}
      {notice && (
        <div className="toast" role="status">
          ✓ {notice}
          {notice === "Added to your cart" && <a href="/cart">Go to cart →</a>}
          <button aria-label="Dismiss notification" onClick={() => notify("")}>
            ×
          </button>
        </div>
      )}
    </Context.Provider>
  );
}
export function useStore() {
  const ctx = useContext(Context);
  if (!ctx) throw Error("Missing store");
  return ctx;
}
