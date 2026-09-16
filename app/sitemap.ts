import { allProducts, config } from "../lib/database";
export default async function sitemap() {
  const base = config("APP_URL");
  if (!base) return [];
  const products = await allProducts();
  return [
    { url: base, changeFrequency: "daily" as const, priority: 1 },
    ...products.map((p) => ({
      url: base + "/product/" + p.slug,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
