import { describe, expect, it } from "vitest";

import { access, row } from "@/lib/billing/fixtures.test-data";

import {
    connectLockFor,
    connectLockLine,
    connectLocksOf,
} from "./connect-lock";
import type { ProviderRowsInput } from "./rows";
import { buildProvidersView } from "./rows";

/** Made-up plans: Free locks both rows, Grow includes both. */
const up = { planId: "grow", name: "Grow", pricePaise: 0 };
const free = access({
    plan: { id: "free", name: "Free" },
    modules: [
        row({
            moduleId: "payments",
            state: "locked",
            limit: null,
            usage: null,
            upgradeTo: up,
        }),
        row({
            moduleId: "integrations",
            state: "locked",
            limit: null,
            usage: null,
            upgradeTo: up,
        }),
    ],
});
const grow = access({
    plan: { id: "grow", name: "Grow" },
    modules: [
        row({ moduleId: "payments", limit: null, usage: null }),
        row({ moduleId: "integrations", limit: null, usage: 0 }),
    ],
});

describe("connectLocksOf (DEC-091, UX-006)", () => {
    it("Free: payments and email both say the plan, with See Grow", () => {
        const locks = connectLocksOf(free);
        for (const lock of [locks.payments, locks.messaging]) {
            expect(lock).toEqual({
                comesWith: "Comes with Grow",
                cta: "See Grow",
                href: "/settings/billing?plan=grow#change-plan",
                upgrade: "Grow",
                full: false,
            });
        }
    });

    it("Grow: nothing locked", () => {
        expect(connectLocksOf(grow)).toEqual({
            payments: null,
            messaging: null,
        });
    });

    it("a capped plan with every connection used says so", () => {
        const full = access({
            modules: [
                row({ moduleId: "payments", limit: null, usage: null }),
                row({ moduleId: "integrations", limit: 1, usage: 1 }),
            ],
        });
        expect(connectLocksOf(full).messaging?.comesWith).toBe(
            "Your plan's connections are all in use",
        );
        expect(connectLocksOf(full).payments).not.toBeNull();
    });

    it("unread or unenforced locks nothing", () => {
        expect(connectLocksOf(null)).toEqual({
            payments: null,
            messaging: null,
        });
        expect(connectLocksOf({ ...free, enforced: false })).toEqual({
            payments: null,
            messaging: null,
        });
    });
});

describe("Providers rows with the plan's locks (UX-006)", () => {
    const input = (
        over: Partial<ProviderRowsInput> = {},
    ): ProviderRowsInput => ({
        health: [
            {
                key: "PAYMENTS",
                label: "Payments",
                status: "NOT_CONFIGURED",
                message: "",
                actionHref: "/settings/providers",
            },
            {
                key: "COMMUNICATIONS",
                label: "Communications",
                status: "NOT_CONFIGURED",
                message: "",
                actionHref: "/settings/providers",
            },
        ],
        payments: [],
        messaging: [],
        domains: [],
        checkout: [],
        ...over,
    });

    it("Free: every row it could connect carries the lock, and no email jump", () => {
        const view = buildProvidersView(input({ locks: connectLocksOf(free) }));
        expect(view.available.length).toBeGreaterThan(0);
        expect(view.available.every((e) => e.lock?.cta === "See Grow")).toBe(
            true,
        );
        expect(view.connectEmailKey).toBeNull();
        expect(view.paymentsLocked).toBe(true);
    });

    it("Grow: Connect is offered", () => {
        const view = buildProvidersView(input({ locks: connectLocksOf(grow) }));
        expect(view.available.every((e) => !e.lock)).toBe(true);
        expect(view.connectEmailKey).not.toBeNull();
        expect(view.paymentsLocked).toBe(false);
    });

    it("a provider already connected is never locked (re-entering keys is allowed)", () => {
        const view = buildProvidersView(
            input({
                locks: connectLocksOf(free),
                payments: [
                    {
                        id: "RAZORPAY",
                        provider: "RAZORPAY",
                        status: "DISABLED",
                        publicKey: null,
                        updatedAt: "",
                    },
                ],
            }),
        );
        const razorpay = view.connected.find((e) => e.name === "Razorpay");
        expect(razorpay?.lock ?? null).toBeNull();
    });
});

describe("the Turn on sheet's lock line (UX-006)", () => {
    it("Free: Payments says the plan and How to pay us; email says the plan", () => {
        const locks = connectLocksOf(free);
        const pay = connectLockFor("PAYMENTS", locks);
        const mail = connectLockFor("COMMUNICATIONS", locks);
        expect(pay && connectLockLine("PAYMENTS", pay)).toBe(
            "Taking payment online comes with Grow. Until then, customers pay you the ways you set in How to pay us.",
        );
        expect(mail && connectLockLine("COMMUNICATIONS", mail)).toBe(
            "Connecting your own email comes with Grow.",
        );
    });

    it("Grow: no lock for either", () => {
        const locks = connectLocksOf(grow);
        expect(connectLockFor("PAYMENTS", locks)).toBeNull();
        expect(connectLockFor("COMMUNICATIONS", locks)).toBeNull();
        expect(connectLockFor("PAYMENTS", null)).toBeNull();
    });
});
