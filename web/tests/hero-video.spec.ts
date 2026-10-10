import { test, expect } from "@playwright/test";

test("hero starts muted, plays both clips, loops and supports pause", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const video = page.locator(".hero-film video");
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(0.2);
  expect(
    await video.evaluate((v: HTMLVideoElement) => ({
      muted: v.muted,
      loop: v.loop,
      inline: v.playsInline,
    })),
  ).toEqual({ muted: true, loop: true, inline: true });
  expect(await video.evaluate((v: HTMLVideoElement) => v.duration)).toBeCloseTo(
    10.0833,
    1,
  );
  // Let the real media clock cross the 0 -> 1 boundary and then wrap to 0.
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), {
      timeout: 14000,
    })
    .toBeGreaterThan(8);
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), {
      timeout: 6000,
    })
    .toBeLessThan(3);
  await page.getByRole("button", { name: "Pause background video" }).click();
  expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  await page.getByRole("button", { name: "Play background video" }).click();
  await expect(
    page.getByRole("button", { name: "Pause background video" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Compare your photos", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Two photos. A clearer picture." }),
  ).toBeVisible();
});

test("reduced motion shows a poster until the visitor chooses play", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const video = page.locator(".hero-film video");
  expect(
    await video.evaluate((v: HTMLVideoElement) => ({
      paused: v.paused,
      autoplay: v.autoplay,
    })),
  ).toEqual({ paused: true, autoplay: false });
  await expect(
    page.getByRole("button", { name: "Play background video" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Play background video" }).click();
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(0.2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("failed video retains the hero and its primary action", async ({
  page,
}) => {
  await page.route("**/videos/hero-sequence.mp4", (route) => route.abort());
  await page.goto("/");
  await expect(page.locator(".hero-film video")).toHaveClass("failed");
  await expect(
    page.getByRole("link", { name: "Compare your photos", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /background video/ }),
  ).toHaveCount(0);
});
