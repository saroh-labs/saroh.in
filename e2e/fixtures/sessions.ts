import fs from "node:fs";
import path from "node:path";

import type { BrowserContext, Page } from "@playwright/test";

import { demoReviewer, demoUser } from "../playwright.config";

/**
 * One signed-in session per seeded person, reused by every spec.
 *
 * The `setup` project (`tests/auth.setup.ts`) signs each of these in through
 * the real sign-in form once per run and saves the browser's storage state
 * under `e2e/.auth/` (gitignored). A spec then carries that session into its
 * own browser context with `useSession` instead of typing a password: about
 * 150 UI sign-ins a run became four, and the accounts sign-in throttle is
 * never reached.
 *
 * Specs whose SUBJECT is signing in — the cross-origin session, #222's
 * return-to, signing out, a customer signing in on a merchant's site — still
 * go through the form (`auth.spec.ts`, `site-*.spec.ts`). Signing out revokes
 * the session on the server, so a spec that signs out must never use one of
 * these: it would sign every later spec out with it.
 *
 * Choosing a business does not touch the shared session: the open business
 * is the workspace's own cookie (`/open/<id>`), written into the spec's
 * context only.
 */
export const people = {
    /** The demo owner: Northwind, and every showcase business. */
    owner: demoUser,
    /** Invited to Northwind's site as a reviewer, nothing else (#276). */
    reviewer: demoReviewer,
    /** Nisha, Rye & Co.'s counter — a Member. */
    member: { email: "nisha.kulkarni@saroh.dev", password: demoUser.password },
    /** Divya on Kavi Dental's desk — a Member. */
    desk: { email: "divya.kamath@saroh.dev", password: demoUser.password },
    /**
     * Farah, on Northwind Store's counter: Storefront team, a Viewer on
     * Northwind Store and not on Online (DEC-074).
     */
    storefront: {
        email: "farah.storefront@saroh.dev",
        password: demoUser.password,
    },
    /**
     * Asha, just signed up (DEC-070): seeded with no business of her own.
     * Specs about setting up make theirs as her, never as the demo owner.
     */
    founder: { email: "founder@saroh.dev", password: demoUser.password },
} as const;

export type Role = keyof typeof people;

export const AUTH_DIR = path.resolve(__dirname, "..", ".auth");

export const sessionFile = (role: Role) => path.join(AUTH_DIR, `${role}.json`);

function roleOf(who: Role | { email: string }): Role {
    if (typeof who === "string") return who;
    const role = (Object.keys(people) as Role[]).find(
        (r) => people[r].email === who.email,
    );
    if (!role) {
        throw new Error(
            `No saved session for ${who.email}: add them to people in e2e/fixtures/sessions.ts`,
        );
    }
    return role;
}

type Cookies = Parameters<BrowserContext["addCookies"]>[0];

/**
 * Carry a saved session into this page's browser context. Nothing is
 * navigated: the caller opens whatever it was going to open.
 */
export async function useSession(
    page: Page,
    who: Role | { email: string } = "owner",
): Promise<void> {
    const role = roleOf(who);
    const file = sessionFile(role);
    let state: { cookies: Cookies };
    try {
        state = JSON.parse(fs.readFileSync(file, "utf8")) as {
            cookies: Cookies;
        };
    } catch {
        throw new Error(
            `No saved session for "${role}" at ${file}. The setup project signs everyone in first (tests/auth.setup.ts); run through --project=desk or --project=phone, and not with --no-deps.`,
        );
    }
    await page.context().addCookies(state.cookies);
}
