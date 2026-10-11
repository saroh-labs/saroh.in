import { describe, expect, it } from "vitest";

import { billingLanding, mayRead, paymentsLockedCopy } from "./access";

/** An owner, as the API resolves them: the built-in's default money reads. */
const OWNER = {
    role: "OWNER" as const,
    actions: ["invoice:read", "subscription:read"],
};

describe("billingLanding — where /billing goes (DEC-070)", () => {
    it("lands on Subscriptions with Payments on", () => {
        expect(billingLanding(OWNER, true)).toBe("/billing/subscriptions");
    });

    it("lands on Invoices with Payments off: invoices need no module", () => {
        expect(billingLanding(OWNER, false)).toBe("/billing/invoices");
    });

    it("lands on Invoices for a role that reads invoices and not subscriptions", () => {
        const org = { role: "MEMBER" as const, actions: ["invoice:read"] };
        expect(billingLanding(org, true)).toBe("/billing/invoices");
    });

    it("Free, memberships locked by the plan: lands on Invoices (UX-047)", () => {
        expect(billingLanding(OWNER, true, true)).toBe("/billing/invoices");
    });

    it("Grow, memberships in the plan: lands on Subscriptions", () => {
        expect(billingLanding(OWNER, true, false)).toBe(
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

    it("never reads the role's name (DEC-098): an Owner reads by its permissions", () => {
        expect(mayRead(OWNER, "invoice:read")).toBe(true);
        expect(mayRead({ role: "OWNER" }, "invoice:read")).toBe(false);
        expect(mayRead({ role: "ADMIN" }, "subscription:read")).toBe(false);
        expect(
            mayRead(
                { role: "MEMBER", actions: ["invoice:read"] },
                "invoice:read",
            ),
        ).toBe(true);
    });

    it("locks nothing when the organization couldn't be read: the API decides", () => {
        expect(mayRead(null, "invoice:read")).toBe(true);
    });
});

describe("paymentsLockedCopy, the locked card's words", () => {
    const WHO = "An owner or admin can change this in Settings › Team.";

    it("a Member is told their role and what it doesn't include", () => {
        expect(
            paymentsLockedCopy({ role: "MEMBER", roleKey: "MEMBER" }),
        ).toEqual({
            title: "You can't open Payments",
            text: `Your role is Member. It doesn't include Payments. ${WHO}`,
        });
    });

    it("a Reviewer reads the same sentence, with their role", () => {
        expect(paymentsLockedCopy({ role: "REVIEWER" })).toEqual({
            title: "You can't open Payments",
            text: `Your role is Reviewer. It doesn't include Payments. ${WHO}`,
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
            title: "You can't open Invoices",
            text: `Your role is Front desk. It doesn't include Invoices. ${WHO}`,
        });
    });

    it("never says money stays with owners: any role can be given it", () => {
        for (const what of ["payments", "invoices", "subscriptions"] as const) {
            const copy = paymentsLockedCopy(
                { role: "MEMBER", roleKey: "MEMBER", roleLabel: "Member" },
                what,
            );
            expect(copy.title).toMatch(/^You can't open [A-Z]/);
            expect(copy.text).not.toMatch(/money stays|Only owners/);
        }
    });

    it("a built-in role outside Payments is told Payments, on any of its screens", () => {
        for (const role of ["MEMBER", "REVIEWER"] as const) {
            expect(
                paymentsLockedCopy({ role, roleKey: role }, "invoices").title,
            ).toBe("You can't open Payments");
        }
    });

    it("a Member the business let see payments is told the one screen", () => {
        expect(
            paymentsLockedCopy(
                {
                    role: "MEMBER",
                    roleKey: "MEMBER",
                    roleLabel: "Member",
                    actions: ["payment:read"],
                },
                "invoices",
            ),
        ).toEqual({
            title: "You can't open Invoices",
            text: `Your role is Member. It doesn't include Invoices. ${WHO}`,
        });
    });

    it("never shows a code or guesses a name, with no name for the role", () => {
        const copy = paymentsLockedCopy({
            role: "MEMBER",
            roleKey: "role_8f2c",
            roleLabel: " ",
        });
        expect(copy.text).toBe(`Your role doesn't include Payments. ${WHO}`);
        expect(`${copy.title} ${copy.text}`).not.toMatch(
            /role_8f2c|[A-Z]{2,}_/,
        );
    });

    it("has no em dash or semicolon in it", () => {
        const copy = paymentsLockedCopy({ role: "REVIEWER" });
        expect(`${copy.title} ${copy.text}`).not.toMatch(/[—;]/);
    });
});
