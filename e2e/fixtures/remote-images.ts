import type { Page } from "@playwright/test";

/** A 1×1 PNG: enough for an <img> to load and for `new Image()` to answer. */
const PIXEL = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64",
);

/**
 * Photos the seed and the specs point at on images.unsplash.com, answered
 * here instead. A browser run fires hundreds of them at once, and a stalled
 * one never loads nor fails: a screen's `load` waits forever, and the
 * editor's address check stays on "Checking…" (24 Oct, on development too).
 * What's tested is Saroh's screen, not Unsplash.
 */
export async function answerRemoteImages(page: Page): Promise<void> {
    await page.route(/^https:\/\/images\.unsplash\.com\//, (route) =>
        route.fulfill({ status: 200, contentType: "image/png", body: PIXEL }),
    );
}
