import { describe, expect, it } from "vitest";

import {
    autopayPanel,
    cancelledText,
    methodNote,
    renewalWords,
} from "./autopay";
import type { AutopayCard, Subscription, SubscriptionAutopay } from "./service";
import { autopayBadgeText, rowWhen } from "./view";

const NOW = new Date("2026-10-03T06:30:00Z");
const TZ = "Asia/Kolkata";

const card = (over: Partial<AutopayCard> = {}): AutopayCard => ({
    offered: true,
    methods: ["UPI", "CARD", "EMANDATE"],
    checks: { UPI: { amount: "1.00", currency: "INR" } },
    provider: "Razorpay",
    setUp: null,
    ended: null,
    limitLow: null,
    emailTo: "meera@example.in",
    ...over,
});

const on: SubscriptionAutopay = {
    state: "ON",
    method: "UPI",
    hint: "mo•••@okicici",
    limit: "1500.00",
    currency: "INR",
    since: "2026-09-03T05:00:00.000Z",
    failure: null,
};

type PanelSub = Parameters<typeof autopayPanel>[0];
const sub = (over: Partial<PanelSub> = {}): PanelSub => ({
    status: "ACTIVE",
    autopay: null,
    autopayCard: card(),
    autopayCharge: null,
    timezone: TZ,
    contact: { id: "c1", name: "Meera Iyer", email: "meera@example.in" },
    ...over,
});

const panel = (s: PanelSub, canWrite = true, paysBy: string | null = null) =>
    autopayPanel(s, { canWrite, paysBy, now: NOW });

describe("autopayPanel (D14)", () => {
    it("no autopay, offered: the pay-link line and Send a set-up link", () => {
        const p = panel(sub());
        expect(p.line).toBe("Each renewal is invoiced with a pay link");
        expect(p.sendLabel).toBe("Send a set-up link");
        expect(p.canCancel).toBe(false);
        expect(p.notice).toBeNull();
    });

    it("autopay on: its line, where it was set up, and Cancel autopay", () => {
        const p = panel(
            sub({
                autopay: on,
                autopayCard: card({
                    setUp: {
                        source: "SETUP_LINK",
                        at: "2026-09-03T05:00:00.000Z",
                        sentBy: "Priya",
                    },
                }),
            }),
        );
        expect(p.line).toBe("Autopay on · UPI · mo•••@okicici · limit ₹1,500");
        expect(p.detail).toBe(
            "Set up by Meera from a set-up link Priya sent · 3 Sep",
        );
        expect(p.sendLabel).toBeNull();
        expect(p.canCancel).toBe(true);
    });

    it("limit too low: says what it covers and the renewal, and offers a set-up link", () => {
        const p = panel(
            sub({
                autopay: on,
                autopayCard: card({
                    limitLow: {
                        limit: "1500.00",
                        amount: "1800.00",
                        currency: "INR",
                        at: "2026-10-01T00:30:00.000Z",
                    },
                }),
            }),
        );
        expect(p.notice).toEqual({
            text: "Autopay limit too low — covers up to ₹1,500, this renewal is ₹1,800",
            tone: "warn",
        });
        expect(p.sendLabel).toBe("Send a set-up link");
        expect(p.canCancel).toBe(true);
    });

    it("pending: waiting for them, a new link may be sent, and it can be stopped", () => {
        const p = panel(
            sub({
                autopay: { ...on, state: "PENDING", hint: null, limit: null },
                autopayCard: card({
                    setUp: {
                        source: "SETUP_LINK",
                        at: "2026-10-02T05:00:00.000Z",
                        sentBy: "Priya",
                    },
                }),
            }),
        );
        expect(p.line).toBe(
            "Autopay pending · UPI — waiting for them to approve it",
        );
        expect(p.detail).toBe("Set-up link sent by Priya · 2 Oct");
        expect(p.sendLabel).toBe("Send a new set-up link");
        expect(p.canCancel).toBe(true);
    });

    it("cancelled, being confirmed: says so, with nothing more charged", () => {
        const p = panel(
            sub({
                autopayCard: card({
                    ended: {
                        at: "2026-10-02T05:00:00.000Z",
                        reason: "STAFF",
                        confirmed: false,
                    },
                }),
            }),
        );
        expect(p.line).toBe(
            "Autopay cancelled 2 Oct — being confirmed with Razorpay",
        );
        expect(p.notice?.tone).toBe("info");
        expect(p.canCancel).toBe(false);
        expect(p.sendLabel).toBe("Send a set-up link");
    });

    it("a charge under way: says so, and no link until it's answered", () => {
        const p = panel(
            sub({
                autopay: on,
                autopayCharge: { at: "2026-10-04T04:30:00.000Z" },
            }),
        );
        expect(p.notice).toEqual({
            text: "Autopay charge in progress · 4 Oct",
            tone: "info",
        });
        expect(p.sendLabel).toBeNull();
    });

    it("not offered (flag off): no autopay UI — today's line, no actions", () => {
        const p = panel(
            sub({ autopayCard: card({ offered: false, methods: [] }) }),
            true,
            "UPI",
        );
        expect(p).toEqual({
            line: "Pays by UPI",
            detail: null,
            notice: null,
            sendLabel: null,
            canCancel: false,
        });
    });

    it("not offered, but a mandate already made still shows and can be cancelled", () => {
        const p = panel(
            sub({
                autopay: on,
                autopayCard: card({ offered: false, methods: [] }),
            }),
        );
        expect(p.line).toContain("Autopay on");
        expect(p.canCancel).toBe(true);
        expect(p.sendLabel).toBeNull();
    });

    it("read-only role, an ended subscription, or an API before D14: no actions", () => {
        expect(panel(sub({ autopay: on }), false)).toMatchObject({
            sendLabel: null,
            canCancel: false,
        });
        expect(panel(sub({ autopay: on, status: "CANCELLED" }))).toMatchObject({
            sendLabel: null,
            canCancel: false,
        });
        expect(panel(sub({ autopayCard: undefined }))).toMatchObject({
            line: "Each renewal is invoiced with a pay link",
            sendLabel: null,
            canCancel: false,
        });
    });
});

describe("methodNote", () => {
    it("says the ₹1 check only for a method that takes one", () => {
        expect(methodNote(card(), "UPI")).toBe(
            "They approve it in their UPI app · a ₹1 check, refunded straight away",
        );
        expect(methodNote(card(), "EMANDATE")).toBe(
            "They approve it with their bank",
        );
    });
});

describe("cancelledText", () => {
    it("says what the provider answered", () => {
        expect(
            cancelledText({ outcome: "CANCELLED", provider: "Razorpay" }).title,
        ).toBe("Autopay cancelled.");
        expect(
            cancelledText({ outcome: "CONFIRMING", provider: "Razorpay" })
                .detail,
        ).toBe("Razorpay hasn't confirmed yet; Saroh keeps asking.");
        expect(
            cancelledText({ outcome: "REFUSED", provider: "Razorpay" }).detail,
        ).toContain("Razorpay dashboard");
        expect(
            cancelledText({ outcome: "ALREADY_OFF", provider: null }).title,
        ).toBe("Autopay was already off.");
    });
});

describe("renewalWords (honest copy)", () => {
    it("promises autopay only where the business offers it", () => {
        expect(renewalWords(true).plan).toContain("paid by autopay");
        expect(renewalWords(true).subscribe).toContain("turn on autopay");
        expect(renewalWords(false).plan).not.toMatch(/autopay/i);
        expect(renewalWords(false).plan).toContain(
            "renews with an invoice each period",
        );
        expect(renewalWords(false).subscribe).toBe(
            "It renews with an invoice each period. Nothing is charged and nobody is contacted.",
        );
    });
});

describe("the list's autopay mark", () => {
    it("says the method and hint, or paused", () => {
        expect(
            autopayBadgeText({
                method: "UPI",
                hint: "mo•••@okicici",
                paused: false,
            }),
        ).toBe("UPI Autopay · mo•••@okicici");
        expect(
            autopayBadgeText({ method: "CARD", hint: null, paused: false }),
        ).toBe("Card autopay");
        expect(
            autopayBadgeText({ method: "UPI", hint: null, paused: true }),
        ).toBe("Autopay paused");
        expect(autopayBadgeText(null)).toBeNull();
    });

    it("follows the next renewal on the row", () => {
        const row: Subscription = {
            id: "s1",
            status: "ACTIVE",
            plan: { id: "p1", name: "Monthly" },
            contact: { id: "c1", name: "Meera Iyer", email: "m@x.in" },
            price: "1200.00",
            currency: "INR",
            interval: "MONTH",
            timezone: TZ,
            currentPeriodStart: "2026-10-01T00:00:00.000Z",
            currentPeriodEnd: "2026-11-01T00:00:00.000Z",
            nextRenewalAt: "2026-10-31T18:30:00.000Z",
            startsAt: null,
            endsAt: null,
            pausedAt: null,
            pausedUntil: null,
            cancelledAt: null,
            overdue: false,
            overdueCount: 0,
            unpaidCount: 0,
            unpaidTotal: "0.00",
            oldestUnpaid: null,
            latestInvoice: null,
            startedAt: "2026-03-02T00:00:00.000Z",
            createdAt: "2026-03-02T00:00:00.000Z",
            autopayOn: { method: "UPI", hint: "mo•••@okicici", paused: false },
        };
        expect(rowWhen(row, NOW).text).toBe(
            "Next 1 Nov · UPI Autopay · mo•••@okicici",
        );
    });
});
