import { describe, expect, it } from "vitest";

import type { PanelCopy } from "./panel-copy";
import * as copy from "./panel-copy";

/**
 * The panel beside every form (UX audit, 10 Oct). It used to explain the
 * sign-in system ("Signing up issues no session until the email is
 * verified"). It says what Saroh does, the plan, and what happens next.
 */

const APP = "https://app.saroh.in";

const PANELS = Object.entries(copy).filter(
    (entry): entry is [string, PanelCopy] =>
        entry[0].endsWith("_PANEL") && typeof entry[1] === "object",
);

function words(panel: PanelCopy): string[] {
    return [
        panel.eyebrow,
        panel.heading,
        panel.body,
        ...(panel.points ?? []),
        ...(panel.steps ?? []),
    ];
}

describe("every panel", () => {
    it("is found by this test", () => {
        expect(PANELS.length).toBeGreaterThanOrEqual(12);
    });

    it.each(PANELS)(
        "%s talks about the person, not the session",
        (_, panel) => {
            for (const line of words(panel)) {
                expect(line).not.toMatch(/\bsessions?\b/i);
                expect(line).not.toMatch(/\blog(ged|ging)? ?in\b|\blogin\b/i);
                expect(line).not.toMatch(
                    /workspace|storefront|organi[sz]ation/i,
                );
                expect(line).not.toMatch(/[—;]/);
            }
        },
    );

    it.each(PANELS)("%s says what happens next, or is the plan", (_, panel) => {
        // The two confirmation panels describe something finished or
        // unchanged, and their page's button is the next step.
        const settled = ["Nothing has changed yet.", "That link has run out."];
        if (settled.includes(panel.heading)) return;
        if (panel === copy.LOGIN_PANEL) return;
        expect(panel.body).toMatch(/\bNext, /);
    });

    it.each(PANELS)("%s ends its body with a full stop", (_, panel) => {
        expect(panel.body).toMatch(/\.$/);
    });
});

describe("the sign-up panel", () => {
    it("leads with what Saroh does", () => {
        expect(copy.PROMISE).toBe(
            "Sell, take bookings, bill and run your website in one place.",
        );
        expect(copy.SIGNUP_PANEL.heading).toBe(copy.PROMISE);
    });

    it("gives the plan in three steps, starting on the first", () => {
        expect(copy.SIGNUP_PANEL.steps).toEqual([
            "Make your account",
            "Name your business",
            "Pick what to do first",
        ]);
        expect(copy.SIGNUP_PANEL.currentStep).toBe(1);
        expect(copy.VERIFY_PANEL.steps).toEqual(copy.SIGNUP_PANEL.steps);
    });

    it("gives an invitee no business to name", () => {
        expect(copy.SIGNUP_JOIN_PANEL.steps).toBeUndefined();
        expect(copy.VERIFY_JOIN_PANEL.steps).toBeUndefined();
        expect(copy.SIGNUP_JOIN_PANEL.body).toContain(
            "The business already exists",
        );
    });
});

describe("verifyBlurb: the line under Check your email", () => {
    it("says what comes next for a new account", () => {
        expect(copy.verifyBlurb(null)).toBe(
            "Type the code we emailed you. Next, you name your business.",
        );
        expect(copy.verifyBlurb(`${APP}/onboarding?plan=grow`)).toBe(
            "Type the code we emailed you. Next, you name your business.",
        );
    });

    it("says an invitee joins, not sets up", () => {
        expect(copy.verifyBlurb(`${APP}/join/abc123`)).toBe(
            "Type the code we emailed you. Next, you join the business that invited you.",
        );
    });

    it("promises nothing about setup to someone on their way elsewhere", () => {
        expect(copy.verifyBlurb(`${APP}/bookings`)).toBe(
            "Type the code we emailed you. Next, you carry on where you were going.",
        );
    });
});

describe("verifiedLine: the line under You're verified", () => {
    it("says business, never workspace", () => {
        expect(copy.verifiedLine(null)).toBe(
            "Taking you to set up your business…",
        );
        expect(copy.verifiedLine(`${APP}/join/abc123`)).toBe(
            "Taking you to the business that invited you…",
        );
        expect(copy.verifiedLine(`${APP}/bookings`)).toBe(
            "Taking you to Saroh…",
        );
    });
});
