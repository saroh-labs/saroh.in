import { describe, expect, it } from "vitest";

import {
    depositLock,
    membershipPlansLock,
    offersOnlinePay,
    onlinePaymentsLock,
    planLocks,
    rowLock,
    rowNotice,
    takesOnlinePayment,
    upgradeHref,
    upgradeLine,
} from "./access";
import { access, offlinePlan, onlinePlan, row } from "./fixtures.test-data";

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

    it("leads Saroh's emails with connecting the business's own email, no add-on (DEC-086)", () => {
        const n = rowNotice(
            access({
                modules: [
                    row({
                        moduleId: "saroh-emails",
                        limit: 10,
                        per: "month",
                        usage: 10,
                    }),
                ],
            }),
            "saroh-emails",
        );
        expect(n).toMatchObject({
            on: true,
            full: true,
            cta: "Connect your email",
            href: "/settings/providers",
        });
        expect(n.on && n.body).toMatch(/^Saroh has stopped sending/);
        expect(n.on && n.body).not.toMatch(/add-on/);
    });

    it("tells, never refuses, at a soft cap (storage in GB)", () => {
        const storage = (usage: number) =>
            rowNotice(
                access({
                    modules: [
                        row({
                            moduleId: "storage",
                            limit: 5,
                            soft: true,
                            usage,
                        }),
                    ],
                }),
                "storage",
            );
        expect(storage(4)).toMatchObject({
            on: true,
            full: false,
            soft: true,
            title: "You've used 4 of 5 GB of photos and videos on Plan A",
            body: "Nothing stops at 5; we'll let you know when you reach it. Plan B gives you more.",
        });
        const full = storage(6);
        expect(full).toMatchObject({
            full: true,
            soft: true,
            title: "You've reached your 5 GB of photos and videos on Plan A",
            why: "",
        });
        expect(full.on && full.body).toMatch(/^Nothing is blocked/);
        expect(full.on && full.body).not.toMatch(/stopped|paused|can't/);
    });

    it("reads a row without soft (an older API) as a hard cap", () => {
        const n = rowNotice(
            access({ modules: [row({ usage: 10 })] }),
            "products",
        );
        expect(n).toMatchObject({ soft: false });
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
            body: "Nothing stops at 11; we'll let you know when you reach it. Plan B gives you more.",
        });
    });

    it("at the cap, says nothing is blocked", () => {
        const notice = rowNotice(storage(11), "storage");
        expect(notice.full).toBe(true);
        expect(notice.on && notice.body).toMatch(/^Nothing is blocked/);
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

describe("depositLock", () => {
    const payments = row({
        moduleId: "payments",
        name: "Online payments",
        state: "locked",
        limit: null,
        usage: null,
        menu: null,
        child: null,
    });

    it("says deposits come with the plan that takes payment online, and services book at the desk", () => {
        const lock = depositLock(
            rowLock(access({ modules: [payments] }), "payments"),
            false,
        );
        expect(lock).toEqual({
            title: "Deposits are taken online, which comes with Plan B",
            body: 'You\'re on Plan A. Services book "pay at the desk" until then.',
            cta: "See Plan B",
            href: "/settings/billing?plan=b#change-plan",
        });
        // Plan names only: never a price.
        expect(JSON.stringify(lock)).not.toMatch(/111|₹/);
    });

    it("says a deposit the service already has is kept, paused", () => {
        expect(
            depositLock(
                rowLock(access({ modules: [payments] }), "payments"),
                true,
            )?.body,
        ).toBe(
            'You\'re on Plan A. This service keeps its deposit, paused: it books "pay at the desk" until then.',
        );
    });

    it("locks nothing when the plan takes payment online, or nothing enforces it", () => {
        expect(
            depositLock(
                rowLock(
                    access({ modules: [{ ...payments, state: "on" }] }),
                    "payments",
                ),
                false,
            ),
        ).toBeNull();
        expect(
            depositLock(
                rowLock(
                    access({ enforced: false, modules: [payments] }),
                    "payments",
                ),
                true,
            ),
        ).toBeNull();
    });
});

describe("membershipPlansLock", () => {
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

    it("says memberships come with the plan above, and that members keep renewing", () => {
        for (const id of ["subscriptions", "payments"]) {
            expect(
                membershipPlansLock(access({ modules: [locked(id)] })),
            ).toEqual({
                title: "Memberships come with Plan B",
                body: "You're on Plan A. Members you already have keep renewing. Your plans stay here to edit or archive, but they're off your site, and new plans can't go on sale until you move to Plan B.",
                cta: "See Plan B",
                href: "/settings/billing?plan=b#change-plan",
            });
        }
    });

    it("names no plan to go to when there is none", () => {
        expect(
            membershipPlansLock(
                access({
                    modules: [{ ...locked("subscriptions"), upgradeTo: null }],
                }),
            ),
        ).toMatchObject({
            title: "Memberships aren't in your Plan A plan",
            cta: "See plans",
            href: "/settings/billing#change-plan",
        });
    });

    it("says nothing while locks aren't enforced, off the catalogue, or with the rows on", () => {
        const modules = [locked("subscriptions")];
        expect(
            membershipPlansLock(access({ enforced: false, modules })),
        ).toBeNull();
        expect(
            membershipPlansLock(access({ source: "legacy", modules })),
        ).toBeNull();
        expect(
            membershipPlansLock(
                access({ modules: [row({ moduleId: "subscriptions" })] }),
            ),
        ).toBeNull();
        expect(membershipPlansLock(null)).toBeNull();
    });
});

describe("takesOnlinePayment and offersOnlinePay (R33)", () => {
    it("is no on a plan whose payments row is locked, while enforced", () => {
        expect(takesOnlinePayment(offlinePlan())).toBe(false);
        expect(offersOnlinePay(offlinePlan(), true, true)).toBe(false);
    });

    it("is yes on a plan with online payments, when everything else is so", () => {
        expect(takesOnlinePayment(onlinePlan())).toBe(true);
        expect(offersOnlinePay(onlinePlan(), true)).toBe(true);
        expect(offersOnlinePay(onlinePlan())).toBe(true);
    });

    it("still needs the screen's own checks — a provider, Payments on", () => {
        expect(offersOnlinePay(onlinePlan(), false)).toBe(false);
        expect(offersOnlinePay(onlinePlan(), true, false)).toBe(false);
    });

    it("fails open as the API does: unread, legacy, unenforced or no row", () => {
        expect(takesOnlinePayment(null)).toBe(true);
        expect(takesOnlinePayment(offlinePlan({ enforced: false }))).toBe(true);
        expect(
            takesOnlinePayment(offlinePlan({ source: "legacy", modules: [] })),
        ).toBe(true);
        expect(takesOnlinePayment(access())).toBe(true);
    });
});
