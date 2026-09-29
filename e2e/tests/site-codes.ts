import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { Page } from "@playwright/test";
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
 * customer with a new email; this gives them a new address too, the way the
 * platform's edge would. The limits themselves are the API's unit tests'.
 */
export async function asNewVisitor(page: Page): Promise<void> {
    visitors += 1;
    const worker = test.info().parallelIndex % 256;
    const address = `198.18.${worker}.${(visitors % 254) + 1}`;
    await page.setExtraHTTPHeaders({ "x-real-ip": address });
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

/** With the sign-in sheet open: ask for a code for `email`, and type it. */
export async function signInOnSheet(page: Page, email: string): Promise<void> {
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    const before = lastCode(email);
    await sheet.getByLabel("Email").fill(email);
    await sheet.getByRole("button", { name: "Send code" }).click();
    const code = await readSiteCode(email, before);
    await sheet.getByLabel("Code").fill(code);
    await sheet.getByRole("button", { name: "Sign in" }).click();
    await expect(sheet).toBeHidden({ timeout: 15_000 });
}
