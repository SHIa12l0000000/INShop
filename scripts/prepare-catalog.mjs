import fs from "node:fs";
const raw = (
  fs.existsSync("work/catalog-source.json")
    ? JSON.parse(fs.readFileSync("work/catalog-source.json", "utf8"))
    : await (await fetch("https://dummyjson.com/products?limit=0")).json()
).products;
const groups = {
  "mobile-accessories": "Electronics",
  smartphones: "Mobiles",
  laptops: "Computers",
  "mens-shirts": "Fashion",
  "womens-dresses": "Fashion",
  "mens-shoes": "Footwear",
  "womens-shoes": "Footwear",
  "home-decoration": "Home & Living",
  furniture: "Home & Living",
  "kitchen-accessories": "Kitchen",
  beauty: "Beauty",
  "skin-care": "Beauty",
  fragrances: "Fragrances",
  "sports-accessories": "Sports",
  groceries: "Grocery",
  "womens-bags": "Bags",
  "mens-watches": "Watches",
  "womens-watches": "Watches",
  vehicle: "Automotive",
  motorcycle: "Automotive",
};
const counts = {};
const selected = raw.filter((p) => {
  if (!groups[p.category]) return false;
  counts[p.category] = (counts[p.category] || 0) + 1;
  return counts[p.category] <= 4;
});
for (const id of [101, 123, 78, 92, 47, 119, 175])
  if (!selected.some((p) => p.id === id))
    selected.push(raw.find((p) => p.id === id));
const brands = [
  "Everyday Co.",
  "Loom & Line",
  "Form Living",
  "Fieldcraft",
  "North & Oak",
  "Fresh Basket",
  "Studio Basics",
  "Wellnest",
  "Arc Home",
  "Move Active",
  "Daily Ritual",
  "Urban Carry",
  "Terra Kitchen",
  "Vista",
  "Kindred",
];
const data = selected.map((p, i) => ({
  id: "prd-" + p.id,
  slug: p.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-$/, ""),
  title: p.title,
  brand: p.brand || brands[i % brands.length],
  category: groups[p.category],
  categorySlug: groups[p.category].toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  description: p.description,
  price: Math.max(9900, Math.round((p.price * 83) / 10) * 1000 - 100),
  mrp: Math.max(
    12900,
    Math.round((p.price * 83) / (1 - p.discountPercentage / 100) / 10) * 1000,
  ),
  rating: p.rating,
  reviews: p.reviews.length * 43 + 13,
  stock: p.stock,
  sku: "INS-" + p.sku,
  images: p.images,
  thumbnail: p.thumbnail,
  discount: Math.round(p.discountPercentage),
  status: "active",
  specs: {
    Brand: p.brand || brands[i % brands.length],
    Weight: p.weight + " kg",
    Dimensions: `${p.dimensions.width} × ${p.dimensions.height} × ${p.dimensions.depth} cm`,
    Warranty: p.warrantyInformation,
    "Return window": p.returnPolicy,
  },
  tags: p.tags,
  variants: [{ id: "standard", label: "Standard", delta: 0 }],
  seller: "INShop Demo Store",
  demo: true,
}));
const slugs = new Set();
for (const p of data) {
  if (slugs.has(p.slug)) p.slug += "-" + p.id.replace("prd-", "");
  slugs.add(p.slug);
}
fs.writeFileSync("lib/catalog.json", JSON.stringify(data, null, 2));
console.log(
  `Prepared ${data.length} products, ${new Set(data.map((p) => p.category)).size} categories, ${new Set(data.map((p) => p.brand)).size} brands.`,
);
