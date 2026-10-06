import { describe, expect, it } from "vitest";

import {
    onlinePaymentsLock,
    planLocks,
    rowNotice,
    upgradeHref,
    upgradeLine,
} from "./access";
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

describe("onlinePaymentsLock", () => {
    const locked = (moduleId: string) =>
        row({
            moduleId,
            name: moduleId,
            state: "locked",
            limit: null,
            usage: null,
            menu: null,
            child: null,
        });

    it("says taking payment online is on the plan above, and what goes on", () => {
        const lock = onlinePaymentsLock(
            access({ modules: [locked("payments")] }),
            "payments",
        );
        expect(lock).toEqual({
            title: "Taking payment online comes with Plan B",
            body: "You're on Plan A. Invoices still go out, as a link to view, and customers pay you another way. Memberships you already have keep renewing.",
            cta: "See Plan B",
            href: "/settings/billing?plan=b#change-plan",
        });
    });

    it("stops new memberships when either row is locked, and says renewals go on", () => {
        for (const id of ["subscriptions", "payments"]) {
            const lock = onlinePaymentsLock(
                access({ modules: [locked(id)] }),
                "subscriptions",
            );
            expect(lock).toMatchObject({
                title: "New memberships come with Plan B",
                body: "You're on Plan A. Everyone already subscribed keeps renewing, and nothing they hold is lost. Subscribing someone new needs Plan B.",
            });
        }
    });

    it("names no plan to go to when there is none", () => {
        const lock = onlinePaymentsLock(
            access({
                modules: [{ ...locked("payments"), upgradeTo: null }],
            }),
            "payments",
        );
        expect(lock).toMatchObject({
            title: "Taking payment online isn't in your Plan A plan",
            cta: "See plans",
            href: "/settings/billing#change-plan",
        });
    });

    it("says nothing while locks aren't enforced, off the catalogue, or with the row on", () => {
        const modules = [locked("payments"), locked("subscriptions")];
        expect(
            onlinePaymentsLock(
                access({ enforced: false, modules }),
                "payments",
            ),
        ).toBeNull();
        expect(
            onlinePaymentsLock(
                access({ source: "legacy", modules }),
                "subscriptions",
            ),
        ).toBeNull();
        expect(
            onlinePaymentsLock(
                access({ modules: [row({ moduleId: "payments" })] }),
                "payments",
            ),
        ).toBeNull();
        expect(onlinePaymentsLock(null, "payments")).toBeNull();
    });

    it("never locks the rail for Payments: the rows have no rail entry, and invoicing lives there", () => {
        expect(
            planLocks(
                access({
                    modules: [locked("payments"), locked("subscriptions")],
                }),
            ),
        ).toEqual([]);
    });
});
