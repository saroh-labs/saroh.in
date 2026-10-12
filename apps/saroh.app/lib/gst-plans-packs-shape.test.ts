import { describe, expect, it } from "vitest";

import { gstOnPriceOf, packsOf, plansOf } from "@saroh/site-blocks";

import { homeDetails, invoicesDueResult } from "./account-details-shape";
import { packCheckoutAnswer, packsOnSaleResult } from "./account-packs-shape";
import { homeResult, planTabResult } from "./account-shape";

/**
 * GST on plans and class packs, as this server reads it from the API: the
 * `gst` answer rides along on the public plans and packs, the account's
 * packs on sale and started purchase, the member's plan and an invoice to
 * pay. Each is read with the field, with null and without it (an API from
 * before it), and the blocks narrow it where they draw it (`gstOnPriceOf`),
 * so anything strange is nothing said, never a wrong amount.
 */

const ADDS = {
    mode: "ADDED",
    rate: "18",
    listCents: 200000,
    gstCents: 36000,
    payCents: 236000,
};
const INCLUDES = {
    mode: "INCLUDED",
    rate: "18",
    listCents: 200000,
    gstCents: 30508,
    payCents: 200000,
};
const EACH_WAY = [ADDS, INCLUDES, null, undefined] as const;

describe("the public plans and packs", () => {
    const plan = {
        id: "plan_1",
        name: "Monthly unlimited",
        description: null,
        price: "2000.00",
        currency: "INR",
        interval: "MONTH",
        mostChosen: false,
    };
    const pack = {
        id: "pack_1",
        name: "10 classes",
        description: null,
        credits: 10,
        validityDays: 60,
        price: "2000.00",
        currency: "INR",
        kind: "CLASSES",
        singlePrice: null,
    };

    it("a plan is read with its GST, with none, and from an API before it", () => {
        for (const gst of EACH_WAY) {
            const read = plansOf({ plans: [{ ...plan, gst }] });
            expect(read).toHaveLength(1);
            expect(gstOnPriceOf(read?.[0]?.gst)).toEqual(gst ?? null);
        }
    });

    it("a pack is read with its GST, with none, and from an API before it", () => {
        for (const gst of EACH_WAY) {
            const read = packsOf({
                payOnline: true,
                packs: [{ ...pack, gst }],
            });
            expect(read?.packs).toHaveLength(1);
            expect(gstOnPriceOf(read?.packs[0]?.gst)).toEqual(gst ?? null);
        }
    });

    it("a strange GST never drops the plan or the pack: it is nothing said", () => {
        const odd = { mode: "ADDED", rate: 18 };
        const plans = plansOf({ plans: [{ ...plan, gst: odd }] });
        expect(plans).toHaveLength(1);
        expect(gstOnPriceOf(plans?.[0]?.gst)).toBeNull();
        const packs = packsOf({
            payOnline: true,
            packs: [{ ...pack, gst: odd }],
        });
        expect(packs?.packs).toHaveLength(1);
        expect(gstOnPriceOf(packs?.packs[0]?.gst)).toBeNull();
    });
});

describe("the account's packs on sale and a started purchase", () => {
    const pack = {
        ref: "pack_1",
        name: "10-class pack",
        description: null,
        credits: 10,
        validityDays: 60,
        price: "2000.00",
        currency: "INR",
        kind: "CLASSES",
    };
    const started = {
        ref: "inv_1",
        pack: { name: "10-class pack", credits: 10, validityDays: 60 },
        total: "2360.00",
        currency: "INR",
        payment: {
            provider: "RAZORPAY",
            providerIntentId: "order_1",
            amountCents: 236000,
            currency: "INR",
            publicKey: "rzp_test_1",
            clientParams: {},
        },
    };

    it("a pack on sale keeps its GST each way", () => {
        for (const gst of EACH_WAY) {
            const read = packsOnSaleResult({
                payOnline: true,
                packs: [{ ...pack, gst }],
            });
            expect(read?.packs).toHaveLength(1);
            expect(gstOnPriceOf(read?.packs[0]?.gst)).toEqual(gst ?? null);
        }
    });

    it("a started purchase keeps the amount to pay and its GST each way", () => {
        for (const gst of EACH_WAY) {
            const answer = packCheckoutAnswer(201, { ...started, gst });
            expect(answer.ok).toBe(true);
            if (!answer.ok) continue;
            expect(answer.data.total).toBe("2360.00");
            expect(gstOnPriceOf(answer.data.gst)).toEqual(gst ?? null);
        }
    });
});

describe("the member's plan and an invoice to pay", () => {
    const plan = {
        ref: "sub_1",
        name: "Monthly 8",
        price: "2000.00",
        currency: "INR",
        interval: "MONTH",
        status: "ACTIVE",
        renewsAt: "2026-10-17T18:30:00.000Z",
        pausedUntil: null,
        endsAt: null,
        timezone: "Asia/Kolkata",
    };
    const sub = {
        ...plan,
        classes: null,
        payNow: null,
        canPause: true,
        canResume: false,
        canCancel: true,
    };
    const invoice = {
        ref: "inv_1",
        number: "INV-0042",
        what: "Monthly 8, November",
        issuedAt: "2026-10-01T05:00:00.000Z",
        dueAt: "2026-10-08T05:00:00.000Z",
        overdue: false,
        total: "2360.00",
        currency: "INR",
        billOfSupply: false,
        pay: "online",
    };

    it("the Plan tab's plan keeps the next renewal's GST each way", () => {
        for (const gst of EACH_WAY) {
            const tab = planTabResult({
                subscriptions: { ok: true, value: [{ ...sub, gst }] },
                packs: { ok: true, value: [] },
                pauseWeeks: [],
            });
            const subs = tab?.subscriptions;
            expect(subs?.ok).toBe(true);
            if (!subs?.ok) continue;
            expect(subs.value[0]?.price).toBe("2000.00");
            expect(gstOnPriceOf(subs.value[0]?.gst)).toEqual(gst ?? null);
        }
    });

    it("Home's plan keeps it too", () => {
        for (const gst of EACH_WAY) {
            const home = homeResult({
                nextBooking: null,
                classes: { ok: true, value: null },
                orders: null,
                plan: { ok: true, value: { ...plan, gst } },
            });
            const read = home?.plan;
            expect(read?.ok).toBe(true);
            if (!read?.ok) continue;
            expect(gstOnPriceOf(read.value?.gst)).toEqual(gst ?? null);
        }
    });

    it("an invoice to pay keeps the GST in its total each way, on Your details and on Home", () => {
        for (const gst of EACH_WAY) {
            const rows = invoicesDueResult([{ ...invoice, gst }]);
            expect(rows).toHaveLength(1);
            expect(gstOnPriceOf(rows?.[0]?.gst)).toEqual(gst ?? null);
            const block = homeDetails({
                invoicesDue: { ok: true, value: [{ ...invoice, gst }] },
            }).invoicesDue;
            expect(block?.ok).toBe(true);
            if (!block?.ok) continue;
            expect(gstOnPriceOf(block.value[0]?.gst)).toEqual(gst ?? null);
        }
    });
});
