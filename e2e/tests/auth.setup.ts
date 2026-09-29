import fs from "node:fs";

import { expect, test as setup } from "@playwright/test";

import type { Role } from "../fixtures/sessions";
import { AUTH_DIR, people, sessionFile } from "../fixtures/sessions";
import { ignoreHTTPSErrors, urls } from "../playwright.config";

/**
 * Sign each seeded person in through the real form, once per run, and save
 * the session for every spec that only needs to BE signed in
 * (`fixtures/sessions.ts`). desk and phone depend on this project, so it
 * runs first whichever specs are picked.
 *
 * Each role is checked in the workspace too: a session that accounts issued
 * but the app cannot see (a cookie on the wrong domain, a bare-port runner
 * against the portless names) fails here, once, by name — not as 150
 * redirects to /login across the suite.
 */
fs.mkdirSync(AUTH_DIR, { recursive: true });

for (const role of Object.keys(people) as Role[]) {
    setup(`sign in as ${role}`, async ({ browser }) => {
        const who = people[role];
        const context = await browser.newContext({
            baseURL: urls.APP_URL,
            ignoreHTTPSErrors,
        });
        try {
            const page = await context.newPage();
            await page.goto(`${urls.ACCOUNTS_URL}/login`);
            await page.getByLabel("Email").fill(who.email);
            await page
                .getByLabel("Password", { exact: true })
                .fill(who.password);
            await page.getByRole("button", { name: "Log in" }).click();
            await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
                timeout: 30_000,
            });

            // Saved as the form left it, before the workspace can add a
            // cookie of its own (an open business) that a spec did not ask for.
            await context.storageState({ path: sessionFile(role) });

            // The workspace, on its own origin, must see the same session.
            await page.goto(`${urls.APP_URL}/`);
            await expect(page).not.toHaveURL(/\/login/);
        } finally {
            await context.close();
        }
    });
}
