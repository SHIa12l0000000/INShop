import { test, expect } from "@playwright/test";
test("customer platform sign-in, address editing, guest merge and sign-out", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto("/search?q=airpods%20max");
  await page.getByRole("button", { name: "Add to cart", exact: true }).click();
  await page.goto("/login");
  await page.getByRole("link", { name: "Continue with ChatGPT" }).click();
  await expect(page.locator(".account-menu")).toContainText("seedy@sites.test");
  await expect(page.getByRole("region", { name: "Guest cart" })).toBeVisible();
  await page.getByRole("button", { name: /Merge \d+ items/ }).click();
  await expect(page.getByRole("region", { name: "Guest cart" })).toHaveCount(0);
  await page.goto("/cart");
  await expect(page.locator(".cart-item")).toHaveCount(1);
  await page.goto("/account/addresses");
  await page.getByRole("button", { name: "+ Add address" }).click();
  const dialog = page.locator("dialog[open]");
  await dialog.locator('[name="name"]').fill("Browser Test");
  await dialog.locator('[name="phone"]').fill("9000000000");
  await dialog.locator('[name="pin"]').fill("201001");
  await dialog.locator('[name="street"]').fill("Test residence 101");
  await dialog.locator('[name="city"]').fill("Ghaziabad");
  await dialog.locator('[name="state"]').fill("Uttar Pradesh");
  await dialog.getByRole("button", { name: "Save address" }).click();
  const card = page
    .locator(".address-list .panel")
    .filter({ hasText: "Browser Test" })
    .first();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Edit", exact: true }).click();
  await dialog.locator('[name="street"]').fill("Updated residence 202");
  await dialog.getByRole("button", { name: "Save address" }).click();
  await expect(card).toContainText("Updated residence 202");
  await card.getByRole("button", { name: "Set as default" }).click();
  await expect(card).toContainText("Default");
  page.once("dialog", (d) => d.accept());
  await card.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(card).toHaveCount(0);
  const logout = page.waitForResponse((r) =>
    r.url().endsWith("/api/auth/logout"),
  );
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  expect((await logout).status()).toBe(200);
  await page.waitForURL("/");
  await expect
    .poll(
      async () =>
        await page.evaluate(async () => {
          const data = (await (await fetch("/api/store/session")).json()) as {
            user: unknown;
          };
          return data.user;
        }),
    )
    .toBeNull();
});
