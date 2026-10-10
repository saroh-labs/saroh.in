import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Where a sign-in lands (UX audit, 10 Oct, severity 4). It used to be
 * `/apps`, a list of Saroh's own hosts. It is Saroh itself now, whose front
 * door sorts out setup, Home or which business.
 */

const APP = "https://app.example.test";

vi.mock("@/env", () => ({
    env: { NEXT_PUBLIC_APP_URL: "https://app.example.test", NODE_ENV: "test" },
}));

import { getAppUrl, getOnboardingUrl } from "./app-urls";
import {
    defaultDestination,
    SIGNED_OUT_PAGES,
    signedInDestination,
} from "./return-to";

beforeEach(() => {
    vi.stubEnv(
        "BETTER_AUTH_TRUSTED_ORIGINS",
        `${APP},https://accounts.example.test`,
    );
});
afterEach(() => {
    vi.unstubAllEnvs();
});

describe("defaultDestination", () => {
    it("is Saroh itself, never the launcher", () => {
        expect(defaultDestination()).toBe(APP);
        expect(defaultDestination()).toBe(getAppUrl());
        expect(defaultDestination()).not.toContain("/apps");
    });

    it("is not setup: the app's front door decides that for itself", () => {
        expect(defaultDestination()).not.toBe(getOnboardingUrl());
        expect(getOnboardingUrl()).toBe(`${APP}/onboarding`);
    });
});

describe("signedInDestination: a signed-in visit to a sign-in page", () => {
    it("goes to Saroh when the link named nowhere", () => {
        expect(signedInDestination(null)).toBe(APP);
        expect(signedInDestination(undefined)).toBe(APP);
        expect(signedInDestination("")).toBe(APP);
    });

    it("goes where the link was taking them, on a trusted origin", () => {
        expect(signedInDestination(`${APP}/join/abc123`)).toBe(
            `${APP}/join/abc123`,
        );
        expect(signedInDestination(`${APP}/bookings?view=week`)).toBe(
            `${APP}/bookings?view=week`,
        );
    });

    it("keeps one of this app's own pages", () => {
        expect(signedInDestination("/account")).toBe("/account");
        expect(signedInDestination("/businesses")).toBe("/businesses");
    });

    it("drops a destination it may not follow", () => {
        expect(signedInDestination("https://evil.example/saroh")).toBe(APP);
        expect(signedInDestination("//evil.example")).toBe(APP);
        expect(signedInDestination("javascript:alert(1)")).toBe(APP);
    });

    it("never sends them back to a sign-in page, which would loop", () => {
        for (const page of SIGNED_OUT_PAGES) {
            expect(signedInDestination(page)).toBe(APP);
            expect(signedInDestination(`${page}?redirect=/login`)).toBe(APP);
        }
        expect(signedInDestination("/reset-password/done")).toBe(APP);
        expect(signedInDestination("/")).toBe(APP);
    });

    it("takes the first of a repeated redirect", () => {
        expect(signedInDestination(["/account", "https://evil.example"])).toBe(
            "/account",
        );
    });
});
