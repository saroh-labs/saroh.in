import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

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
