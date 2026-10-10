import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

/**
 * Signing in on a merchant's site from a browser test (round-2 plan A, A9).
 *
 * The stack under test has no SMTP, so the API's fake code transport leaves
 * each code in the system temp directory, one file per address
 * (`apps/api.saroh.in/src/common/site-code-outbox.ts`; keep the two in
 * step). That only works with the API on the same machine as the browser —
 * portless locally, one runner in CI.
 */

function outboxPath(email: string): string {
    return path.join(
        tmpdir(),
        "saroh-site-codes",
        encodeURIComponent(email.trim().toLowerCase()),
    );
}

function lastCode(email: string): string | null {
    try {
        const code = readFileSync(outboxPath(email), "utf8").trim();
        return /^\d{6}$/.test(code) ? code : null;
    } catch {
        return null;
    }
}

/** Where this worker's addresses start, so back-to-back runs rarely share one. */
let visitors = Math.floor(Math.random() * 254);

/**
 * Stand in for a different customer on a merchant's site: a visitor address
 * of their own (198.18.0.0/15, the benchmarking range: one per call, and a
 * third octet per worker, so two tests running at once never share one).
 *
 * Off the platform every visitor reaches the API as the loopback address
 * (`visitorAddress`, `apps/saroh.app/lib/site-relay.ts`), so one run's
 * customers would share the public booking limit (5 a minute for a service,
 * per address) and the sign-in code limits, and the sixth booking of a run
 * would be refused as "a lot of tries at once". Each test here is a new
 * customer with a new email; this gives them a new address too, in the one
 * header the renderer reads (`cf-connecting-ip`), the way Cloudflare's edge
 * would. The limits themselves are the API's unit tests'.
 */
export async function asNewVisitor(page: Page): Promise<void> {
    visitors += 1;
    const worker = test.info().parallelIndex % 256;
    const address = `198.18.${worker}.${(visitors % 254) + 1}`;
    await page.setExtraHTTPHeaders({ "cf-connecting-ip": address });
}

/** The code the API just sent to `email`. */
export async function readSiteCode(
    email: string,
    previous: string | null = null,
): Promise<string> {
    let code: string | null = null;
    await expect
        .poll(
            () => {
                code = lastCode(email);
                return code !== null && code !== previous;
            },
            { timeout: 15_000 },
        )
        .toBe(true);
    return code as unknown as string;
}

/**
 * A field a phone won't zoom into: iOS Safari zooms the page when a field
 * set under 16px takes focus, and leaves it zoomed. The size the browser
 * computed, polled so a slow first paint waits.
 */
export async function expectNoZoomOnFocus(field: Locator): Promise<void> {
    await expect
        .poll(() =>
            field.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
        )
        .toBeGreaterThanOrEqual(16);
}

/**
 * With the sign-in sheet open: ask for a code for `email`, and type it.
 * The sheet checks the code as its sixth digit lands, so there is no
 * button to press: it closes by itself once signed in.
 */
export async function signInOnSheet(page: Page, email: string): Promise<void> {
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    const before = lastCode(email);
    await expectNoZoomOnFocus(sheet.getByLabel("Email"));
    await sheet.getByLabel("Email").fill(email);
    await sheet.getByRole("button", { name: "Send code" }).click();
    const code = await readSiteCode(email, before);
    const field = sheet.getByLabel("Code");
    // A phone's keyboard for it, and the code offered from the message.
    await expect(field).toHaveAttribute("inputmode", "numeric");
    await expect(field).toHaveAttribute("autocomplete", "one-time-code");
    await expectNoZoomOnFocus(field);
    await field.fill(code);
    await expect(sheet).toBeHidden({ timeout: 15_000 });
}

/**
 * After signing in at the booking page's last step with a new account: it
 * has no name yet, so the page asks for one now (and only now; a signed-out
 * visitor is never asked), keeps everything chosen, and books on the next
 * press. Gives the name and presses the page's own button, whatever it
 * reads ("Book", "Pay ₹500 and book", "Pay and book" on a phone's bar).
 */
export async function nameThenBook(page: Page, name: string): Promise<void> {
    const field = page.getByLabel("Name");
    await expect(field).toBeVisible({ timeout: 15_000 });
    await expectNoZoomOnFocus(field);
    await field.fill(name);
    await page
        .getByRole("button", { name: /^(Book|Pay )/ })
        .filter({ visible: true })
        .first()
        .click();
}
