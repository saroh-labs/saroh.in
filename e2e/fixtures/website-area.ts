import type { Page } from "@playwright/test";

import { urls } from "../playwright.config";

/**
 * Whether this stack has the Website area on: the api's `WEBSITE_AREA`
 * (DEC-240), asked as the app asks it (`GET /website-area`). On in CI and
 * `pnpm prepush --e2e`, off in production. Read with the page's session,
 * so call it after `useSession`.
 *
 * A spec about today's screens (area off) skips when it is on, and one
 * about the area's screens skips when it is off, saying which.
 */
export async function websiteAreaOn(page: Page): Promise<boolean> {
    const res = await page.request.get(`${urls.API_URL}/website-area`);
    if (!res.ok()) return false;
    return ((await res.json()) as { on?: unknown }).on === true;
}
