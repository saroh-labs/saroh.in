import { describe, expect, it } from "vitest";

import { billingLanding, mayRead, paymentsLockedCopy } from "./access";

describe("billingLanding — where /billing goes (DEC-070)", () => {
    it("lands on Subscriptions with Payments on", () => {
        expect(billingLanding({ role: "OWNER" }, true)).toBe(
            "/billing/subscriptions",
        );
    });

    it("lands on Invoices with Payments off: invoices need no module", () => {
        expect(billingLanding({ role: "OWNER" }, false)).toBe(
            "/billing/invoices",
        );
    });

    it("lands on Invoices for a role that reads invoices and not subscriptions", () => {
        const org = { role: "MEMBER" as const, actions: ["invoice:read"] };
        expect(billingLanding(org, true)).toBe("/billing/invoices");
    });

    it("Free, memberships locked by the plan: lands on Invoices (UX-047)", () => {
        expect(billingLanding({ role: "OWNER" }, true, true)).toBe(
            "/billing/invoices",
        );
    });

    it("Grow, memberships in the plan: lands on Subscriptions", () => {
        expect(billingLanding({ role: "OWNER" }, true, false)).toBe(
            "/billing/subscriptions",
        );
    });

    it("leaves a role that reads neither to Subscriptions' own gate", () => {
        expect(billingLanding({ role: "MEMBER" }, false)).toBe(
            "/billing/subscriptions",
        );
    });
});

describe("mayRead — who opens Payments' screens (D18)", () => {
    it("asks the resolved actions when there are some", () => {
        const org = { role: "MEMBER" as const, actions: ["invoice:read"] };
        expect(mayRead(org, "invoice:read")).toBe(true);
        expect(mayRead(org, "subscription:read")).toBe(false);
    });

    it("falls back to money staying with owners and admins", () => {
        expect(mayRead({ role: "OWNER" }, "invoice:read")).toBe(true);
        expect(mayRead({ role: "ADMIN" }, "subscription:read")).toBe(true);
        expect(mayRead({ role: "MEMBER" }, "invoice:read")).toBe(false);
        expect(mayRead({ role: "REVIEWER" }, "invoice:read")).toBe(false);
    });

    it("locks nothing when the organization couldn't be read: the API decides", () => {
        expect(mayRead(null, "invoice:read")).toBe(true);
    });
});

describe("paymentsLockedCopy — the locked card's words", () => {
    it("a Member gets the design's sentences", () => {
        expect(
            paymentsLockedCopy({ role: "MEMBER", roleKey: "MEMBER" }),
        ).toEqual({
            title: "Only owners and admins see payments",
            text: "Your role is Member — money stays with owners and admins. An owner or admin can change that in Team.",
        });
    });

    it("a Reviewer is told what their role does cover", () => {
        expect(paymentsLockedCopy({ role: "REVIEWER" })).toEqual({
            title: "You can't open payments",
            text: "Your role is Reviewer, which can see the website but not payments. An owner or admin can change that in Team.",
        });
    });

    it("a role the business made is named, and told what it lacks", () => {
        expect(
            paymentsLockedCopy(
                {
                    role: "MEMBER",
                    roleKey: "front_desk",
                    roleLabel: "Front desk",
                    actions: ["payment:read", "subscription:read"],
                },
                "invoices",
            ),
        ).toEqual({
            title: "You can't open invoices",
            text: "Your role is Front desk, which doesn't include invoices. An owner or admin can change that in Team.",
        });
    });

    it("a Member the business let see payments isn't told money stays with owners", () => {
        const copy = paymentsLockedCopy(
            {
                role: "MEMBER",
                roleKey: "MEMBER",
                roleLabel: "Member",
                actions: ["payment:read"],
            },
            "invoices",
        );
        expect(copy.title).toBe("You can't open invoices");
        expect(copy.text).not.toMatch(/owners and admins\b.*money|money stays/);
    });

    it("never shows a code, even with no name for the role", () => {
        const copy = paymentsLockedCopy({
            role: "MEMBER",
            roleKey: "role_8f2c",
            roleLabel: " ",
        });
        expect(copy.text).toBe(
            "Your role doesn't include payments. An owner or admin can change that in Team.",
        );
        expect(`${copy.title} ${copy.text}`).not.toMatch(
            /role_8f2c|[A-Z]{2,}_/,
        );
    });
});
