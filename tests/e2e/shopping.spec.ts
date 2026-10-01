import { test, expect } from "@playwright/test";
test("first visit skip persists; guest cart, wishlist and comparison work", async ({
  page,
}) => {
  test.setTimeout(60000); // This multi-route flow includes cold dev-server compilations.
  await page.goto("/");
  await page.getByRole("button", { name: "Skip for now", exact: true }).click();
  await expect(page.locator(".product")).toHaveCount(8);
  await page
    .locator(".product")
    .first()
    .getByRole("button", { name: "Add to cart", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Added to your cart");
  await page.goto("/cart");
  await expect(page.locator(".cart-item")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".cart-item")).toHaveCount(1);
  await page.getByRole("button", { name: /Increase/ }).click();
  await expect(page.locator(".quantity span")).toHaveText("2");
  await page.goto("/search?q=airpods%20max");
  await expect(page.locator(".product")).toHaveCount(1);
  await page.getByRole("button", { name: /Save Apple/ }).click();
  await page.goto("/wishlist");
  await expect(page.locator(".product")).toHaveCount(1);
  await page.getByRole("button", { name: /Compare Apple/ }).click();
  await page.goto("/compare");
  await expect(page.locator(".compare-table")).toBeVisible();
  await page.goto("/");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
});
test("search empty state and sorting are functional", async ({ page }) => {
  await page.goto("/search?q=nothingmatches999");
  await expect(page.getByText(/We couldn’t find products/)).toBeVisible();
  await page.goto("/search");
  await page.getByLabel("Sort by").selectOption("low");
  const prices = await page.locator(".price-row strong").allTextContents();
  const nums = prices.map((v) => Number(v.replace(/[^0-9]/g, "")));
  expect(nums).toEqual([...nums].sort((a, b) => a - b));
});
test("mobile product and cart have no horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/product/apple-airpods-max-silver");
  await expect(
    page.getByRole("heading", {
      name: "Apple AirPods Max Silver",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page
    .locator(".purchase-panel")
    .getByRole("button", { name: "Add to cart", exact: true })
    .click();
  await page.goto("/cart");
  await expect(page.locator(".cart-item")).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});
test("admin demo is read only and private admin rejects visitors", async ({
  page,
}) => {
  await page.goto("/admin/demo");
  await expect(
    page.getByText("Demo workspace · Sample analytics", { exact: false }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.goto("/admin/products");
  await expect(
    page.getByRole("heading", { name: "Secure administrator access" }),
  ).toBeVisible();
});
