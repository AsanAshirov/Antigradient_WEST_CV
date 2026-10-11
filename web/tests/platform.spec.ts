import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("inspection to journey, saved comparison, report, analytics and local deletion", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/scanner");
  await expect(
    page.getByText("Processing online", { exact: true }),
  ).toBeVisible();
  const fixture = await page.request.get("/api/example/reference");
  const photo = {
    name: "inspection.jpg",
    mimeType: "image/jpeg",
    buffer: await fixture.body(),
  };
  await page.getByLabel("Vehicle ID").fill("cp-test");
  await page.getByLabel("Inspector / organisation").fill("QA team");
  await page.getByLabel("Inspection notes").fill("Front panel baseline.");
  await page.locator("input[type=file]").first().setInputFiles(photo);
  await page.getByRole("button", { name: "Run AI inspection" }).click();
  await expect(
    page.getByText("Ready for visual comparison", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save to journey" }).click();
  await expect(
    page.getByText("Inspection saved on this device.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next inspection" }).click();
  await expect(
    page.getByRole("combobox", { name: "Checkpoint", exact: true }),
  ).toHaveValue("Arrival Terminal");
  const next = await page.request.get("/api/example/current");
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      ...photo,
      name: "arrival.jpg",
      buffer: await next.body(),
    });
  await page.getByRole("button", { name: "Run AI inspection" }).click();
  await expect(
    page.getByRole("button", { name: "Save to journey" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save to journey" }).click();
  await page.getByRole("link", { name: "View journey" }).click();
  await expect(page.locator(".timeline-entry")).toHaveCount(2);
  await page.reload();
  await expect(page.locator(".timeline-entry")).toHaveCount(2);
  await page.getByRole("link", { name: "Compare with previous" }).click();
  await expect(page.locator(".has-photo")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Compare photos", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Geometric alignment found" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Open reports" }).click();
  await expect(
    page.getByRole("heading", { name: "CP-TEST", exact: true }),
  ).toBeVisible();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export evidence" }).click();
  const file = await downloaded;
  const saved = JSON.parse(await readFile((await file.path())!, "utf8"));
  expect(saved.vehicle).toBe("CP-TEST");
  expect(saved.sample).toBe(false);
  expect(saved.checkpoints).toEqual(["Factory", "Arrival Terminal"]);
  expect(saved.result.geometry).toBe("MATCHED");
  await page
    .getByRole("navigation", { name: "Workspace navigation" })
    .getByRole("link", { name: /Analytics/ })
    .click();
  await expect(page.locator(".analytics-metrics .panel").first()).toContainText(
    "2",
  );
  await page
    .getByRole("combobox", { name: "Checkpoint", exact: true })
    .selectOption("Factory");
  await expect(page.locator(".analytics-metrics .panel").first()).toContainText(
    "1",
  );
  await page.getByRole("button", { name: "Clear local records" }).click();
  await page.getByRole("button", { name: "Delete local records" }).click();
  await expect(page.locator(".analytics-metrics .panel").first()).toContainText(
    "0",
  );
  await page.reload();
  await expect(page.locator(".analytics-metrics .panel").first()).toContainText(
    "0",
  );
  expect(errors).toEqual([]);
});

test("every route is English, responsive and refreshable", async ({ page }) => {
  for (const route of [
    "/",
    "/scanner",
    "/compare",
    "/journey",
    "/reports",
    "/analytics",
    "/technology",
    "/business",
  ]) {
    await page.goto(route);
    await expect(page.locator("h1")).toBeVisible();
    expect(await page.locator("body").innerText()).not.toMatch(/[А-Яа-яЁё]/);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${route} at ${width}px`,
      ).toBe(true);
    }
  }
});

test("scanner rejects unsupported files and reports server failures without fabricated results", async ({
  page,
}) => {
  await page.goto("/scanner");
  await page.getByLabel("Vehicle ID").fill("CP-ERROR");
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "bad.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from("<svg/>"),
    });
  await expect(page.getByRole("alert")).toContainText("JPG, PNG or WebP");
  const fixture = await page.request.get("/api/example/reference");
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "car.jpg",
      mimeType: "image/jpeg",
      buffer: await fixture.body(),
    });
  await page.route("**/api/inspect", (r) =>
    r.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Processing is unavailable" }),
    }),
  );
  await page.getByRole("button", { name: "Run AI inspection" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Processing is unavailable",
  );
  await expect(
    page.getByRole("button", { name: "Save to journey" }),
  ).toHaveCount(0);
});
