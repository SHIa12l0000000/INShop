"use client";
import { useEffect, useState } from "react";
import { StoreProvider, useStore, api } from "./store-provider";
import { Header, Footer } from "./header";
import Home from "./home";
import Catalog, { Categories } from "./catalog";
import ProductDetail from "./product-detail";
import Cart, { Wishlist, Compare } from "./cart";
import AuthForm from "./auth-form";
import Checkout from "./checkout";
import Account from "./account";
import Admin from "./admin";
import Help from "./help";
import Info from "./info";
import { Modal, Empty, ProductCard } from "./ui";
export default function Shop({ route = "/" }: { route?: string }) {
  return (
    <StoreProvider>
      <Surface route={route} />
    </StoreProvider>
  );
}
function Surface({ route }: { route: string }) {
  const s = useStore();
  const [welcome, setWelcome] = useState(false);
  useEffect(() => {
    if (route === "/" && !localStorage.getItem("inshop-auth-choice")) {
      const t = setTimeout(() => setWelcome(true), 1600);
      return () => clearTimeout(t);
    }
  }, [route]);
  useEffect(() => {
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    const ctx = (document as any).modelContext;
    if (!ctx?.registerTool) return;
    const lifecycle = new AbortController();
    Promise.resolve(
      ctx.registerTool(
        {
          name: "search_inshop_products",
          title: "Search INShop",
          description:
            "Search the INShop catalog and navigate to the visible results. Does not place an order.",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string", minLength: 1, maxLength: 200 },
            },
            required: ["query"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true },
          execute: async (input: any) => {
            if (
              typeof input.query !== "string" ||
              !input.query.trim() ||
              input.query.length > 200
            )
              throw Error("Enter a search query between 1 and 200 characters");
            const q = input.query.trim();
            location.assign("/search?q=" + encodeURIComponent(q));
            return {
              query: q,
              destination: "/search?q=" + encodeURIComponent(q),
            };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => {});
    return () => lifecycle.abort();
  }, []);
  if (route.startsWith("/admin")) return <Admin route={route} />;
  let content;
  if (route === "/") content = <Home />;
  else if (
    route === "/search" ||
    route === "/deals" ||
    route.startsWith("/category/")
  )
    content = <Catalog route={route} />;
  else if (route === "/categories") content = <Categories />;
  else if (route.startsWith("/product/"))
    content = <ProductDetail slug={route.split("/")[2]} />;
  else if (route === "/cart") content = <Cart />;
  else if (route.startsWith("/wishlist/shared/"))
    content = <SharedWishlist token={route.split("/")[3]} />;
  else if (route === "/wishlist") content = <Wishlist />;
  else if (route === "/compare") content = <Compare />;
  else if (
    ["/login", "/register", "/forgot-password", "/verify"].includes(route)
  )
    content = (
      <div className="auth-page">
        <div className="auth-aside">
          <span className="eyebrow">YOUR WORLD. YOUR FINDS.</span>
          <h2>
            Make room for
            <br />
            the good stuff.
          </h2>
          <p>
            Everyday essentials, thoughtful upgrades
            <br />
            and a little something just for you.
          </p>
          <img
            src="https://cdn.dummyjson.com/product-images/mobile-accessories/apple-airpods-max-silver/1.webp"
            alt="Silver headphones"
          />
        </div>
        <AuthForm mode={route.slice(1)} />
      </div>
    );
  else if (route === "/checkout/success") content = <Success />;
  else if (route === "/checkout") content = <Checkout />;
  else if (route.startsWith("/account")) content = <Account route={route} />;
  else if (route === "/help") content = <Help />;
  else content = <Info route={route} />;
  return (
    <>
      <Header />
      <main id="main" className="wrap">
        {s.error && (
          <div className="error-banner" role="alert">
            {s.error}
            <button onClick={s.reload}>Try again</button>
          </div>
        )}
        {content}
      </main>
      <Footer />
      {s.compare.length > 0 && (
        <a className="compare-float" href="/compare">
          Compare products ({s.compare.length}) →
        </a>
      )}
      <Modal
        title="Your INShop"
        open={welcome}
        close={() => {
          localStorage.setItem("inshop-auth-choice", "guest");
          setWelcome(false);
        }}
      >
        <AuthForm skip={() => setWelcome(false)} />
      </Modal>
    </>
  );
}
function SharedWishlist({ token }: { token: string }) {
  const s = useStore();
  const [list, setList] = useState<any>(null),
    [error, setError] = useState("");
  useEffect(() => {
    api("/api/store/shared-wishlist/" + token)
      .then(setList)
      .catch((e) => setError(e.message));
  }, [token]);
  if (error) return <Empty title="This wishlist is unavailable." />;
  return (
    <>
      <div className="page-heading">
        <h1>{list?.name ?? "Shared wishlist"}</h1>
      </div>
      <div className="products">
        {s.products
          .filter((p) => JSON.parse(list?.data ?? "[]").includes(p.id))
          .map((p) => (
            <ProductCard product={p} key={p.id} />
          ))}
      </div>
    </>
  );
}
function Success() {
  const [reference, setReference] = useState(""),
    [valid, setValid] = useState(false);
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("order");
    if (id)
      api("/api/store/orders/" + id)
        .then((d) => {
          setReference(id);
          setValid(d.rows.length > 0);
        })
        .catch(() => {});
  }, []);
  return valid ? (
    <Empty
      title="Thank you for your order"
      body={
        "Order " +
        reference +
        " has been received. View your order for payment and delivery updates."
      }
      href={"/account/orders/" + reference}
      action="Track order"
    />
  ) : (
    <Empty
      title="Your order details are in your account."
      href="/account/orders"
      action="View orders"
    />
  );
}
