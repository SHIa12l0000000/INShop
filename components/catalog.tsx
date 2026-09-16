"use client";
import { useEffect, useState } from "react";
import { SlidersHorizontal, X, Search } from "lucide-react";
import { useStore } from "./store-provider";
import { ProductCard, Empty, SkeletonGrid } from "./ui";
export default function Catalog({ route }: { route: string }) {
  const s = useStore();
  const [q, setQ] = useState(""),
    [category, setCategory] = useState(
      route.startsWith("/category/") ? route.split("/")[2] : "",
    ),
    [brand, setBrand] = useState(""),
    [max, setMax] = useState(500000),
    [rating, setRating] = useState(0),
    [sort, setSort] = useState("recommended"),
    [stock, setStock] = useState(false),
    [filters, setFilters] = useState(false),
    [page, setPage] = useState(1);
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    setQ(p.get("q") ?? "");
    if (p.get("category")) setCategory(p.get("category")!);
    if (p.get("sort")) setSort(p.get("sort")!);
  }, []);
  const categories = [...new Set(s.products.map((p) => p.category))];
  const brands = [
    ...new Set(
      s.products
        .filter(
          (p) =>
            !category || p.categorySlug === category || p.category === category,
        )
        .map((p) => p.brand),
    ),
  ].sort();
  const term = q
    .toLowerCase()
    .replace("headphones", "airpods")
    .replace("phone case", "mobile");
  const rows = s.products.filter(
    (p) =>
      (!term ||
        (p.title + " " + p.brand + " " + p.category + " " + p.tags.join(" "))
          .toLowerCase()
          .includes(term)) &&
      (!category || p.categorySlug === category || p.category === category) &&
      (!brand || p.brand === brand) &&
      p.price <= max * 100 &&
      p.rating >= rating &&
      (!stock || p.stock > 0) &&
      (route !== "/deals" || p.discount >= 10),
  );
  rows.sort((a, b) =>
    sort === "low"
      ? a.price - b.price
      : sort === "high"
        ? b.price - a.price
        : sort === "rating"
          ? b.rating - a.rating
          : sort === "discount"
            ? b.discount - a.discount
            : sort === "popular"
              ? b.reviews - a.reviews
              : 0,
  );
  const title =
    route === "/deals"
      ? "Great finds. Even better prices."
      : category
        ? (s.products.find(
            (p) => p.categorySlug === category || p.category === category,
          )?.category ?? category)
        : q
          ? "Results for “" + q + "”"
          : "Find your next favourite";
  return (
    <>
      <div className="breadcrumb">
        <a href="/">Home</a> / {category || "Shop"}
      </div>
      <div className="listing-title">
        <div>
          <div className="eyebrow">
            {route === "/deals" ? "TODAY’S DEALS" : "A WORLD OF DISCOVERY"}
          </div>
          <h1>{title}</h1>
          <p>
            {s.loading
              ? "Loading products…"
              : rows.length + " products to explore"}{" "}
            · Sample catalog
          </p>
        </div>
        <button
          className="button secondary mobile-filter"
          onClick={() => setFilters(!filters)}
        >
          <SlidersHorizontal size={17} />
          Filters
        </button>
      </div>
      <div className="listing-layout">
        <aside className={"filters " + (filters ? "open" : "")}>
          <div className="row-between">
            <h3>Filters</h3>
            <button
              className="text-link"
              onClick={() => {
                setBrand("");
                setCategory("");
                setMax(500000);
                setRating(0);
                setStock(false);
              }}
            >
              Reset
            </button>
          </div>
          <label>
            Category
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Brand
            <select
              value={brand}
              onChange={(e) => {
                setBrand(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All brands</option>
              {brands.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </label>
          <label>
            Maximum price: ₹{max.toLocaleString("en-IN")}
            <input
              type="range"
              min="100"
              max="500000"
              step="100"
              value={max}
              onChange={(e) => {
                setMax(+e.target.value);
                setPage(1);
              }}
            />
          </label>
          <label>
            Customer rating
            <select
              value={rating}
              onChange={(e) => {
                setRating(+e.target.value);
                setPage(1);
              }}
            >
              <option value="0">All ratings</option>
              <option value="4">4 stars & above</option>
              <option value="3">3 stars & above</option>
            </select>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={stock}
              onChange={(e) => setStock(e.target.checked)}
            />{" "}
            In stock only
          </label>
          <div className="filter-note">
            Considered choices.
            <br />
            <strong>Everyday value.</strong>
            <p>Find something that fits your life.</p>
          </div>
        </aside>
        <div>
          <div className="results-toolbar">
            <span>{rows.length} results</span>
            <label>
              Sort by{" "}
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="recommended">Recommended</option>
                <option value="popular">Popular</option>
                <option value="low">Price: low to high</option>
                <option value="high">Price: high to low</option>
                <option value="rating">Customer rating</option>
                <option value="discount">Biggest discount</option>
              </select>
            </label>
          </div>
          {s.loading ? (
            <SkeletonGrid />
          ) : rows.length ? (
            <>
              <div className="products listing-products">
                {rows.slice((page - 1) * 12, page * 12).map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
              <div className="pagination">
                {Array.from({ length: Math.ceil(rows.length / 12) }, (_, i) => (
                  <button
                    key={i}
                    className={page === i + 1 ? "active" : ""}
                    onClick={() => {
                      setPage(i + 1);
                      window.scrollTo({ top: 150, behavior: "smooth" });
                    }}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <Empty
              title={"We couldn’t find products for “" + q + "”."}
              body="Check the spelling, try fewer words, or browse our categories."
              href="/categories"
              action="Browse categories"
            />
          )}
        </div>
      </div>
    </>
  );
}
export function Categories() {
  const s = useStore();
  const cats = Array.from(
    new Map(
      s.products.map((p) => [
        p.category,
        { name: p.category, slug: p.categorySlug, image: p.thumbnail },
      ]),
    ).values(),
  );
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">FIND YOUR SOMETHING</span>
        <h1>Shop by category</h1>
        <p>From everyday essentials to your next great discovery.</p>
      </div>
      <div className="category-directory">
        {cats.map((c) => (
          <a href={"/category/" + c.slug} key={c.slug}>
            <img src={c.image} alt="" />
            <h2>{c.name}</h2>
            <span>Explore collection →</span>
          </a>
        ))}
      </div>
    </>
  );
}
