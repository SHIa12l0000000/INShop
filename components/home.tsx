"use client";
import {
  ArrowRight,
  Truck,
  ShieldCheck,
  RotateCcw,
  ShoppingBag,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";
import { useStore } from "./store-provider";
import { ProductCard, SectionTitle, SkeletonGrid } from "./ui";
export default function Home() {
  const s = useStore();
  const [slide, setSlide] = useState(0);
  const cats = Array.from(
    new Map(
      s.products.map((p) => [
        p.category,
        { title: p.category, slug: p.categorySlug, image: p.thumbnail },
      ]),
    ).values(),
  );
  const preferred = [
    "Mobiles",
    "Electronics",
    "Fashion",
    "Home & Living",
    "Kitchen",
    "Beauty",
    "Sports",
    "Grocery",
  ];
  const categories = preferred
    .map((c) => cats.find((x) => x.title === c))
    .filter(Boolean);
  const featured = ["prd-101", "prd-123", "prd-78", "prd-92"];
  const picks = featured
    .map((id) => s.products.find((p) => p.id === id))
    .filter(Boolean);
  const banner = s.banners[slide % s.banners.length];
  return (
    <>
      <section className="hero">
        <div>
          <div className="eyebrow">
            {banner?.eyebrow ?? "THE EVERYDAY UPGRADE"}
          </div>
          <h1>{banner?.title ?? "Good finds. Great everyday."}</h1>
          <p>
            {banner?.subtitle ??
              "Little upgrades. Big possibilities. Discover more of what you love, for less."}
          </p>
          <a className="button" href={banner?.href ?? "/deals"}>
            {banner?.cta ?? "Explore the deals"} <ArrowRight size={18} />
          </a>
          <small>Everything you need. One smart shop.</small>
        </div>
        <img
          src={
            banner?.image ??
            "https://cdn.dummyjson.com/product-images/mobile-accessories/apple-airpods-max-silver/1.webp"
          }
          alt="Silver over-ear headphones"
          fetchPriority="high"
        />
        <div className="hero-note">
          <span>YOUR SOUND. ELEVATED.</span>
          <b>Find your focus.</b>
          <a href="/category/electronics">Shop audio →</a>
        </div>
        {s.banners.length > 1 && (
          <div className="hero-controls">
            <button
              aria-label="Previous banner"
              onClick={() =>
                setSlide((v) => (v - 1 + s.banners.length) % s.banners.length)
              }
            >
              <ChevronLeft />
            </button>
            <span>
              {slide + 1} / {s.banners.length}
            </span>
            <button
              aria-label="Next banner"
              onClick={() => setSlide((v) => (v + 1) % s.banners.length)}
            >
              <ChevronRight />
            </button>
          </div>
        )}
      </section>
      <div className="benefits">
        <span>
          <Truck />
          Delivery made easy
        </span>
        <span>
          <ShieldCheck />
          Secure shopping
        </span>
        <span>
          <RotateCcw />
          Clear return policies
        </span>
        <span>
          <ShoppingBag />A world of great finds
        </span>
      </div>
      <section className="category-section">
        <SectionTitle
          title="What are you shopping for?"
          href="/categories"
          link="Explore categories"
        />
        <div className="categories">
          {categories.map(
            (c) =>
              c && (
                <a href={"/category/" + c.slug} key={c.slug}>
                  <div>
                    <img src={c.image} alt="" loading="lazy" />
                  </div>
                  <span>{c.title}</span>
                </a>
              ),
          )}
        </div>
      </section>
      <section className="section-space">
        <SectionTitle
          eyebrow="SMALL PRICES. BIG POSSIBILITIES."
          title="Deals worth discovering"
          href="/deals"
        />
        {s.loading ? (
          <SkeletonGrid />
        ) : (
          <div className="products">
            {picks.map((p) => p && <ProductCard key={p.id} product={p} />)}
          </div>
        )}
      </section>
      <section className="edits">
        <a href="/category/home-living" className="edit-card">
          <div>
            <span className="eyebrow">MAKE ROOM FOR BETTER</span>
            <h2>
              Your home.
              <br />A fresh perspective.
            </h2>
            <p>Thoughtful finds for the everyday.</p>
            <span className="text-link">
              Explore home <ArrowRight size={16} />
            </span>
          </div>
          <img
            src={s.products.find((p) => p.id === "prd-47")?.thumbnail}
            alt="Table lamp"
            loading="lazy"
          />
        </a>
        <a href="/category/fashion" className="edit-card fashion">
          <div>
            <span className="eyebrow">YOUR EVERYDAY, REIMAGINED</span>
            <h2>
              New season.
              <br />
              Your kind of style.
            </h2>
            <p>Wear what feels like you.</p>
            <span className="text-link">
              Find your style <ArrowRight size={16} />
            </span>
          </div>
          <img
            src={s.products.find((p) => p.id === "prd-92")?.thumbnail}
            alt="Sports sneakers"
            loading="lazy"
          />
        </a>
      </section>
      <section className="section-space">
        <SectionTitle
          eyebrow="THE INSHOP EDIT"
          title="Everyday favourites"
          href="/search?sort=rating"
        />
        {s.loading ? (
          <SkeletonGrid />
        ) : (
          <div className="products">
            {[...s.products]
              .sort((a, b) => b.rating - a.rating)
              .slice(0, 4)
              .map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
          </div>
        )}
      </section>
      <div className="welcome-strip">
        <div className="coupon-mark">
          10<span>%</span>
        </div>
        <div>
          <h2>A little welcome goes a long way.</h2>
          <p>
            Use WELCOME10 for 10% off eligible orders over ₹999. Maximum ₹1,000.
          </p>
        </div>
        <a className="button secondary" href="/deals">
          Find your first favourite <ArrowRight size={16} />
        </a>
      </div>
    </>
  );
}
