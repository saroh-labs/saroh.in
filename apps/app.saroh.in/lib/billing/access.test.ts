import { describe, expect, it } from "vitest";

import { planLocks, rowNotice, upgradeHref, upgradeLine } from "./access";
import { access, row } from "./fixtures.test-data";

describe("rowNotice", () => {
    it("says nothing under 80%", () => {
        expect(
            rowNotice(access({ modules: [row({ usage: 7 })] }), "products").on,
        ).toBe(false);
    });

    it("warns from 80%, in the shared words", () => {
        const n = rowNotice(
            access({ modules: [row({ usage: 8 })] }),
            "products",
        );
        expect(n).toMatchObject({
            on: true,
            full: false,
            pct: "80%",
            title: "You've used 8 of 10 products on Plan A",
            body: "You'll be stopped at 10. Plan B gives you more.",
            cta: "Upgrade or add more",
        });
    });

    it("is full at the limit, with what stops", () => {
        const n = rowNotice(
            access({ modules: [row({ usage: 10 })] }),
            "products",
        );
        expect(n).toMatchObject({
            on: true,
            full: true,
            title: "You've reached your 10 products on Plan A",
            body: "You can't add more products. Plan B raises the limit, or add more with an add-on.",
            why: "You've reached your products limit on Plan A",
        });
    });

    it("says the team's paused line as the design does", () => {
        const n = rowNotice(
            access({
                modules: [
                    row({
                        moduleId: "members",
                        limit: 3,
                        usage: 3,
                        upgradeTo: null,
                    }),
                ],
            }),
            "members",
        );
        expect(n).toMatchObject({
            full: true,
            body: "New invites are paused. Everyone already on the team keeps access. Add more with an add-on.",
            cta: "Add more",
        });
    });

    it("stays quiet while limits aren't enforced, off the catalogue, or unread", () => {
        const full = [row({ usage: 10 })];
        expect(
            rowNotice(access({ enforced: false, modules: full }), "products")
                .on,
        ).toBe(false);
        expect(
            rowNotice(access({ source: "legacy", modules: full }), "products")
                .on,
        ).toBe(false);
        expect(rowNotice(null, "products").on).toBe(false);
        // A row with no cap, or one nothing counts.
        expect(
            rowNotice(
                access({ modules: [row({ limit: null, usage: 50 })] }),
                "products",
            ).on,
        ).toBe(false);
        expect(
            rowNotice(
                access({
                    modules: [row({ moduleId: "invoicing", usage: 50 })],
                }),
                "invoicing",
            ).on,
        ).toBe(false);
    });
});

describe("planLocks", () => {
    it("names the rail rows a locked catalogue row locks, while enforced", () => {
        const view = access({
            modules: [
                row({
                    moduleId: "bookings",
                    state: "locked",
                    menu: "bookingsx",
                    child: null,
                }),
                row({
                    moduleId: "invoicing",
                    state: "locked",
                    menu: "paymentsx",
                    child: null,
                }),
                row({
                    moduleId: "roles",
                    state: "hidden",
                    menu: null,
                    child: null,
                }),
                row({ state: "on" }),
            ],
        });
        // Invoicing has no registry module and no meter: nothing enforces it.
        expect(planLocks(view).map((l) => l.href)).toEqual(["/bookings"]);
        expect(planLocks({ ...view, enforced: false })).toEqual([]);
    });
});

describe("upgradeLine and upgradeHref", () => {
    it("says which plan has it and its price before GST", () => {
        expect(
            upgradeLine({
                name: "Invoices",
                plan: "Plan A",
                upgradeTo: { planId: "b", name: "Plan B", pricePaise: 11_100 },
            }),
        ).toBe(
            "Invoices comes with Plan B, ₹111 a month + GST. You're on Plan A.",
        );
        expect(
            upgradeLine({ name: "Invoices", plan: "Plan A", upgradeTo: null }),
        ).toBe("Invoices isn't in your Plan A plan.");
    });

    it("lands on the picker with the plan to look at", () => {
        expect(upgradeHref("b")).toBe("/settings/billing?plan=b#change-plan");
        expect(upgradeHref(null)).toBe("/settings/billing#change-plan");
    });
});

describe("rowNotice on a soft cap", () => {
    const storage = (usage: number) =>
        access({
            modules: [
                row({
                    moduleId: "storage",
                    soft: true,
                    limit: 11,
                    usage,
                }),
            ],
        });

    it("warns from 80% without saying anything will stop", () => {
        expect(rowNotice(storage(9), "storage")).toMatchObject({
            on: true,
            full: false,
            body: "Nothing stops at 11. Plan B gives you more.",
        });
    });

    it("at the cap, says nothing is blocked", () => {
        expect(rowNotice(storage(11), "storage")).toMatchObject({
            full: true,
            body: expect.stringMatching(/^Nothing is blocked/),
        });
    });
});
