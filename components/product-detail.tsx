"use client";
import { useEffect, useState } from "react";
import {
  Heart,
  Share2,
  Truck,
  ShieldCheck,
  RotateCcw,
  Plus,
  Minus,
  Check,
  Star,
} from "lucide-react";
import { useStore, api } from "./store-provider";
import { money } from "../lib/types";
import {
  Rating,
  ProductCard,
  SectionTitle,
  Empty,
  Modal,
  SkeletonGrid,
} from "./ui";
export default function ProductDetail({ slug }: { slug: string }) {
  const s = useStore();
  const p = s.products.find((p) => p.slug === slug);
  const [image, setImage] = useState(0),
    [quantity, setQuantity] = useState(1),
    [zoom, setZoom] = useState(false),
    [tab, setTab] = useState("Overview"),
    [reviews, setReviews] = useState<any[]>([]),
    [questions, setQuestions] = useState<any[]>([]),
    [review, setReview] = useState(""),
    [stars, setStars] = useState(5),
    [question, setQuestion] = useState("");
  useEffect(() => {
    if (!p) return;
    api("/api/store/product/" + slug)
      .then((d) => {
        setReviews(d.reviews);
        setQuestions(d.questions);
      })
      .catch(() => {});
    let recent = [];
    try {
      recent = JSON.parse(localStorage.getItem("inshop-recent") ?? "[]");
    } catch {}
    localStorage.setItem(
      "inshop-recent",
      JSON.stringify(
        [p.id, ...recent.filter((id: string) => id !== p.id)].slice(0, 20),
      ),
    );
    if (s.user)
      api("/api/store/recently-viewed", { productId: p.id }).catch(() => {});
  }, [p?.id, slug, s.user]);
  if (s.loading) return <SkeletonGrid />;
  if (!p) return <Empty title="This product is no longer available." />;
  return (
    <>
      <div className="breadcrumb">
        <a href="/">Home</a> /{" "}
        <a href={"/category/" + p.categorySlug}>{p.category}</a> / {p.brand}
      </div>
      <div className="product-detail">
        <div className="gallery">
          <button
            className="main-image"
            onClick={() => setZoom(true)}
            aria-label="Enlarge product image"
          >
            <img src={p.images[image]} alt={p.title} />
            <span>Click to enlarge</span>
          </button>
          <div className="thumbnails">
            {p.images.map((img, i) => (
              <button
                className={image === i ? "active" : ""}
                onClick={() => setImage(i)}
                key={img}
                aria-label={"View image " + (i + 1)}
              >
                <img src={img} alt="" />
              </button>
            ))}
          </div>
        </div>
        <div className="product-info">
          <a
            className="brand-link"
            href={"/search?q=" + encodeURIComponent(p.brand)}
          >
            {p.brand} store
          </a>
          <h1>{p.title}</h1>
          <Rating value={p.rating} count={p.reviews} />
          <span className="sample-label">Sample catalog ratings</span>
          <div className="detail-price">
            <strong>{money(p.price)}</strong>
            <del>{money(p.mrp)}</del>
            <span>Save {Math.round((1 - p.price / p.mrp) * 100)}%</span>
            <p>Inclusive of applicable taxes · Demo pricing</p>
          </div>
          <div className="offer">
            <span className="coupon-icon">%</span>
            <div>
              <b>A warm welcome, on us.</b>
              <p>
                10% off eligible orders over ₹999 with{" "}
                <strong>WELCOME10</strong>.
              </p>
            </div>
          </div>
          <label>
            Choose variant
            <div className="variant-row">
              {p.variants.map((v) => (
                <button className="active" key={v.id}>
                  {v.label}
                </button>
              ))}
            </div>
          </label>
          <h3>About this item</h3>
          <p className="description">{p.description}</p>
          <ul className="highlights">
            <li>Sold by {p.seller}</li>
            <li>{p.specs.Warranty}</li>
            <li>Check the return policy before purchasing</li>
          </ul>
          <div className="detail-actions">
            <button onClick={() => s.wish(p.id)}>
              <Heart
                size={17}
                fill={s.wishlist.includes(p.id) ? "currentColor" : "none"}
              />{" "}
              {s.wishlist.includes(p.id) ? "Saved" : "Save to wishlist"}
            </button>
            <button
              onClick={() => {
                navigator.clipboard
                  .writeText(location.href)
                  .then(() => s.notify("Product link copied"))
                  .catch(() => s.notify("Copy this page address to share."));
              }}
            >
              <Share2 size={17} /> Share
            </button>
            <button onClick={() => s.compareToggle(p.id)}>
              Compare {s.compare.includes(p.id) ? "✓" : "+"}
            </button>
          </div>
        </div>
        <aside className="purchase-panel">
          <strong>{money(p.price)}</strong>
          <div className={p.stock > 0 ? "in-stock" : "error-text"}>
            {p.stock > 10
              ? "In stock"
              : p.stock > 0
                ? "Limited stock"
                : "Out of stock"}
          </div>
          <p>
            <MapDelivery /> Deliver to PIN {s.pin}
          </p>
          <p className="subtext">
            Delivery dates and charges are confirmed before you place an order.
          </p>
          <label>
            Quantity
            <div className="quantity">
              <button
                aria-label="Decrease quantity"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
              >
                <Minus size={14} />
              </button>
              <span>{quantity}</span>
              <button
                aria-label="Increase quantity"
                onClick={() => setQuantity(Math.min(10, p.stock, quantity + 1))}
              >
                <Plus size={14} />
              </button>
            </div>
          </label>
          <button
            className="button gold"
            disabled={!p.stock}
            onClick={() => s.add(p.id, quantity)}
          >
            Add to cart
          </button>
          <button
            className="button"
            disabled={!p.stock}
            onClick={() => {
              sessionStorage.setItem(
                "inshop-buy-now",
                JSON.stringify([{ id: p.id, variant: "standard", quantity }]),
              );
              location.href = "/checkout?buyNow=1";
            }}
          >
            Buy now
          </button>
          {!p.stock && (
            <button
              className="button secondary"
              onClick={() => {
                if (!s.user) {
                  location.href = "/login";
                  return;
                }
                api("/api/store/stock-alerts", { productId: p.id })
                  .then(() => s.notify("Stock alert requested"))
                  .catch((e) => s.notify(e.message));
              }}
            >
              Notify me when available
            </button>
          )}
          <div className="trust-line">
            <ShieldCheck size={16} /> Secure checkout
          </div>
          <small>
            Sold by {p.seller}
            <br />
            SKU: {p.sku}
          </small>
        </aside>
      </div>
      <div className="product-tabs">
        {["Overview", "Specifications", "Reviews", "Questions"].map((t) => (
          <button
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
            key={t}
          >
            {t}
          </button>
        ))}
      </div>
      <section className="detail-section">
        {tab === "Overview" ? (
          <>
            <h2>Made for your everyday</h2>
            <p>{p.description}</p>
            <div className="benefits">
              <span>
                <Truck />
                Delivery options at checkout
              </span>
              <span>
                <RotateCcw />
                {p.specs["Return window"]}
              </span>
              <span>
                <ShieldCheck />
                {p.specs.Warranty}
              </span>
            </div>
          </>
        ) : tab === "Specifications" ? (
          <>
            <h2>The details that matter</h2>
            <table className="spec-table">
              <tbody>
                {Object.entries(p.specs).map(([key, value]) => (
                  <tr key={key}>
                    <th>{key}</th>
                    <td>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : tab === "Reviews" ? (
          <>
            <h2>Customer reviews</h2>
            <p className="subtext">
              Catalog ratings are sample data. Reviews submitted on INShop
              appear below.
            </p>
            {reviews.map((r) => (
              <div className="review" key={r.id}>
                <Rating value={r.rating} />
                <b>{r.name}</b>
                {!!r.verified && (
                  <span className="in-stock">Verified Purchase</span>
                )}
                <p>{r.body}</p>
              </div>
            ))}
            {!reviews.length && (
              <p className="subtext">
                No INShop reviews yet. Be the first to share your experience
                after delivery.
              </p>
            )}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await api("/api/store/reviews", {
                    productId: p.id,
                    body: review,
                    rating: stars,
                  });
                  s.notify("Your review was saved");
                  const d = await api("/api/store/product/" + slug);
                  setReviews(d.reviews);
                } catch (e) {
                  s.notify((e as Error).message);
                }
              }}
            >
              <h3>Write a review</h3>
              <label>
                Rating
                <select
                  value={stars}
                  onChange={(e) => setStars(+e.target.value)}
                >
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>
                      {n} stars
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Your experience
                <textarea
                  required
                  minLength={20}
                  maxLength={3000}
                  value={review}
                  onChange={(e) => setReview(e.target.value)}
                />
              </label>
              <button className="button">Submit review</button>
            </form>
          </>
        ) : (
          <>
            <h2>Questions & answers</h2>
            {questions.map((q) => (
              <div className="review" key={q.id}>
                <h3>{q.body}</h3>
                <p>{q.answer ?? "Awaiting an answer from the store."}</p>
              </div>
            ))}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await api("/api/store/questions", {
                    productId: p.id,
                    body: question,
                  });
                  s.notify("Question submitted");
                  const d = await api("/api/store/product/" + slug);
                  setQuestions(d.questions);
                } catch (e) {
                  s.notify((e as Error).message);
                }
              }}
            >
              <label>
                Ask about this product
                <textarea
                  required
                  minLength={10}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                />
              </label>
              <button className="button">Ask a question</button>
            </form>
          </>
        )}
      </section>
      <section className="section-space">
        <SectionTitle
          title="You might also like"
          href={"/category/" + p.categorySlug}
        />
        <div className="products">
          {s.products
            .filter((x) => x.category === p.category && x.id !== p.id)
            .slice(0, 4)
            .map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
        </div>
      </section>
      <Modal title={p.title} open={zoom} close={() => setZoom(false)}>
        <img className="zoom-image" src={p.images[image]} alt={p.title} />
      </Modal>
    </>
  );
}
function MapDelivery() {
  return <Truck size={17} />;
}
