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

/** The API's email setup (`GET …/comms-providers/email-setup`). */
const HELD = { connected: false, canConnect: false };
const ROOM = { connected: false, canConnect: true };

describe("connectLocksOf (DEC-091, UX-006)", () => {
    it("email's lock is the email setup's answer, never a second read of the plan", () => {
        expect(connectLocksOf(free, ROOM).messaging).toBeNull();
        expect(connectLocksOf(free, null).messaging).toBeNull();
        // The plan unread: still held, said without a plan's name.
        expect(connectLocksOf(null, HELD)).toEqual({
            payments: null,
            messaging: {
                comesWith: "Comes with a paid plan",
                cta: "See plans",
                href: "/settings/billing#change-plan",
                upgrade: null,
                full: false,
            },
        });
    });

    it("Free: payments and email both say the plan, with See Grow", () => {
        const locks = connectLocksOf(free, HELD);
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
        expect(connectLocksOf(grow, ROOM)).toEqual({
            payments: null,
            messaging: null,
            paymentsAgain: null,
        });
    });

    it("a capped plan with every connection used says so", () => {
        const full = access({
            modules: [
                row({ moduleId: "payments", limit: null, usage: null }),
                row({ moduleId: "integrations", limit: 1, usage: 1 }),
            ],
        });
        expect(connectLocksOf(full, HELD).messaging?.comesWith).toBe(
            "Your plan's connections are all in use",
        );
        expect(connectLocksOf(full, HELD).payments).not.toBeNull();
    });

    it("unread or unenforced locks nothing", () => {
        expect(connectLocksOf(null, null)).toEqual({
            payments: null,
            messaging: null,
        });
        expect(connectLocksOf({ ...free, enforced: false }, ROOM)).toEqual({
            payments: null,
            messaging: null,
            paymentsAgain: null,
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
        const view = buildProvidersView(
            input({ locks: connectLocksOf(free, HELD) }),
        );
        expect(view.available.length).toBeGreaterThan(0);
        expect(view.available.every((e) => e.lock?.cta === "See Grow")).toBe(
            true,
        );
        expect(view.connectEmailKey).toBeNull();
        expect(view.paymentsLocked).toBe(true);
    });

    it("Grow: Connect is offered", () => {
        const view = buildProvidersView(
            input({ locks: connectLocksOf(grow, ROOM) }),
        );
        expect(view.available.every((e) => !e.lock)).toBe(true);
        expect(view.connectEmailKey).not.toBeNull();
        expect(view.paymentsLocked).toBe(false);
    });

    it("a provider still connected is never locked (re-entering keys is allowed)", () => {
        const view = buildProvidersView(
            input({
                locks: connectLocksOf(free, HELD),
                payments: [
                    {
                        id: "RAZORPAY",
                        provider: "RAZORPAY",
                        status: "CONNECTED",
                        publicKey: "rzp_test_abc",
                        updatedAt: "",
                    },
                ],
            }),
        );
        const razorpay = view.connected.find((e) => e.name === "Razorpay");
        expect(razorpay?.lock ?? null).toBeNull();
    });

    it("Free: a provider connected once and disabled carries the lock, never the key form (UX-017)", () => {
        const view = buildProvidersView(
            input({
                locks: connectLocksOf(free, HELD),
                payments: [
                    {
                        id: "RAZORPAY",
                        provider: "RAZORPAY",
                        status: "DISABLED",
                        publicKey: null,
                        updatedAt: "",
                    },
                ],
                messaging: [
                    {
                        id: "EMAIL",
                        channel: "EMAIL",
                        provider: "RESEND",
                        status: "DISABLED",
                        fromAddress: null,
                        updatedAt: "",
                    },
                ],
            }),
        );
        const razorpay = view.connected.find((e) => e.name === "Razorpay");
        const resend = view.connected.find((e) => e.name === "Resend");
        expect(razorpay?.state).toBe("DISCONNECTED");
        expect(razorpay?.lock?.cta).toBe("See Grow");
        expect(resend?.state).toBe("DISCONNECTED");
        expect(resend?.lock?.cta).toBe("See Grow");
    });

    it("Grow: a disabled provider is offered Connect again", () => {
        const view = buildProvidersView(
            input({
                locks: connectLocksOf(grow, ROOM),
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
        const locks = connectLocksOf(free, HELD);
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
        const locks = connectLocksOf(grow, ROOM);
        expect(connectLockFor("PAYMENTS", locks)).toBeNull();
        expect(connectLockFor("COMMUNICATIONS", locks)).toBeNull();
        expect(connectLockFor("PAYMENTS", null)).toBeNull();
    });
});

describe("a connection whose provider refused its keys (UX-012, FB-7)", () => {
    const health = [
        {
            key: "PAYMENTS" as const,
            label: "Payments",
            status: "ACTIVE" as const,
            message: "",
            actionHref: "/settings/providers",
        },
        {
            key: "COMMUNICATIONS" as const,
            label: "Communications",
            status: "ACTIVE" as const,
            message: "",
            actionHref: "/settings/providers",
        },
    ];
    const refused = {
        reason: "KEYS_REFUSED" as const,
        since: "2026-10-07T00:00:00Z",
    };

    it("reads Needs attention, and Enter keys again clears it", () => {
        const view = buildProvidersView({
            health,
            payments: [
                {
                    id: "r",
                    provider: "RAZORPAY",
                    status: "CONNECTED",
                    publicKey: "rzp_live_Abc",
                    attention: refused,
                    updatedAt: "",
                },
            ],
            messaging: [
                {
                    id: "e",
                    channel: "EMAIL",
                    provider: "RESEND",
                    status: "CONNECTED",
                    fromAddress: null,
                    attention: refused,
                    updatedAt: "",
                },
            ],
            domains: [],
            checkout: [],
        });
        for (const entry of view.connected) {
            expect(entry.state).toBe("ATTENTION");
            expect(entry.fix).toBe("Enter keys again");
            expect(entry.note).toMatch(
                /^Needs attention — .* refused its keys/,
            );
        }
    });
});
