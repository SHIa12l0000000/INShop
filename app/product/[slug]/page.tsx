import Shop from "../../../components/shop";
import { allProducts, config } from "../../../lib/database";
import type { Metadata } from "next";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const p = (await allProducts()).find((p) => p.slug === slug);
    if (!p) return { title: "Product unavailable | INShop" };
    return {
      title: p.title + " | INShop",
      description: p.description,
      alternates: { canonical: config("APP_URL") + "/product/" + slug },
      openGraph: {
        title: p.title,
        description: p.description,
        type: "website",
      },
    };
  } catch {
    return { title: "Shop INShop" };
  }
}
export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let structured = null;
  try {
    const p = (await allProducts()).find((p) => p.slug === slug);
    if (p)
      structured = {
        "@context": "https://schema.org",
        "@type": "Product",
        name: p.title,
        description: p.description,
        image: p.images,
        sku: p.sku,
        brand: { "@type": "Brand", name: p.brand },
        ...(p.demo
          ? {}
          : {
              offers: {
                "@type": "Offer",
                priceCurrency: "INR",
                price: p.price / 100,
                availability: p.stock
                  ? "https://schema.org/InStock"
                  : "https://schema.org/OutOfStock",
                url: config("APP_URL") + "/product/" + slug,
              },
            }),
      };
  } catch {}
  return (
    <>
      {structured && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structured).replace(/</g, "\\u003c"),
          }}
        />
      )}
      <Shop route={"/product/" + slug} />
    </>
  );
}
