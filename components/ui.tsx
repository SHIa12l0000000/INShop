"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X, Star, Heart, Plus, ArrowRight, Scale } from "lucide-react";
import type { Product } from "../lib/types";
import { money } from "../lib/types";
import { useStore } from "./store-provider";
export function Modal({
  open,
  close,
  title,
  children,
}: {
  open: boolean;
  close: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && !ref.current?.open) ref.current?.showModal();
    else if (!open && ref.current?.open) ref.current.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onCancel={close}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
      aria-label={title}
    >
      <div className="modal-top">
        <h2>{title}</h2>
        <button onClick={close} aria-label="Close">
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Rating({ value, count }: { value: number; count?: number }) {
  return (
    <span className="rating">
      <Star size={13} fill="currentColor" />
      {value.toFixed(1)}
      {count !== undefined && <span>({count.toLocaleString("en-IN")})</span>}
    </span>
  );
}
export function ProductCard({ product: p }: { product: Product }) {
  const { add, wish, wishlist, compare, compareToggle } = useStore();
  return (
    <article className="product">
      <a className="product-image" href={"/product/" + p.slug}>
        <img
          src={p.thumbnail}
          alt={p.title}
          loading="lazy"
          width="280"
          height="220"
        />
      </a>
      <span className="product-badge">
        {p.discount >= 15
          ? "Great deal"
          : p.rating >= 4.5
            ? "Top rated"
            : "Everyday pick"}
      </span>
      <button
        className={"heart " + (wishlist.includes(p.id) ? "selected" : "")}
        aria-label={(wishlist.includes(p.id) ? "Remove " : "Save ") + p.title}
        onClick={() => wish(p.id)}
      >
        <Heart
          size={17}
          fill={wishlist.includes(p.id) ? "currentColor" : "none"}
        />
      </button>
      <div className="muted brand">{p.brand}</div>
      <a href={"/product/" + p.slug}>
        <h3>{p.title}</h3>
      </a>
      <Rating value={p.rating} count={p.reviews} />
      <div className="price-row">
        <strong>{money(p.price)}</strong>
        <del>{money(p.mrp)}</del>
        <span>{Math.round((1 - p.price / p.mrp) * 100)}% off</span>
      </div>
      <div className="delivery-label">
        {p.stock > 0
          ? "Delivery options at checkout"
          : "Currently out of stock"}
      </div>
      <div className="card-actions">
        <button onClick={() => add(p.id)} disabled={p.stock === 0}>
          <Plus size={15} /> Add to cart
        </button>
        <button
          title="Compare product"
          aria-label={"Compare " + p.title}
          aria-pressed={compare.includes(p.id)}
          onClick={() => compareToggle(p.id)}
        >
          <Scale size={16} />
        </button>
      </div>
    </article>
  );
}
export function SectionTitle({
  eyebrow,
  title,
  href = "/search",
  link = "View all",
}: {
  eyebrow?: string;
  title: string;
  href?: string;
  link?: string;
}) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h2>{title}</h2>
      </div>
      <a href={href}>
        {link}
        <ArrowRight size={17} />
      </a>
    </div>
  );
}
export function Empty({
  title,
  body,
  href = "/",
  action = "Start shopping",
}: {
  title: string;
  body?: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="empty">
      <img src="/favicon.svg" alt="" width="65" height="65" />
      <h2>{title}</h2>
      {body && <p>{body}</p>}
      <a className="button" href={href}>
        {action} <ArrowRight size={16} />
      </a>
    </div>
  );
}
export function SkeletonGrid() {
  return (
    <div className="products" aria-busy="true" aria-label="Loading products">
      {[1, 2, 3, 4].map((i) => (
        <div className="product" key={i}>
          <div className="skeleton" style={{ height: 200 }} />
          <div className="skeleton" style={{ height: 20, marginTop: 15 }} />
          <div
            className="skeleton"
            style={{ height: 20, width: "65%", marginTop: 10 }}
          />
        </div>
      ))}
    </div>
  );
}
