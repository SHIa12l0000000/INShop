export type Product = {
  id: string;
  slug: string;
  title: string;
  brand: string;
  category: string;
  categorySlug: string;
  description: string;
  price: number;
  mrp: number;
  rating: number;
  reviews: number;
  stock: number;
  sku: string;
  images: string[];
  thumbnail: string;
  discount: number;
  status: string;
  specs: Record<string, string>;
  tags: string[];
  variants: { id: string; label: string; delta: number }[];
  seller: string;
  demo: boolean;
};
export type CartLine = { id: string; variant: string; quantity: number };
export type User = {
  id: string;
  email: string;
  name: string;
  role: string;
  provider?: "site" | "supabase";
};
export const money = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);
export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-$/, "");
