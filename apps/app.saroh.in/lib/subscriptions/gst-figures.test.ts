import { describe, expect, it } from "vitest";

import type { GstAsk } from "@/lib/gst/item-words";
import type { GstOnPrice } from "@/lib/gst/on-price";

import { planCard } from "./plan-cards";
import { glanceRows, planHeader, subscriberRows } from "./plan-detail";
import type { PlanForm } from "./plan-editor";
import { glance, priceToPay, whoPays } from "./plan-editor";
import type { Plan, Subscription } from "./service";
import {
    headline,
    keepsLine,
    monthlyTotal,
    olderPrice,
    olderPriceNotes,
    payRows,
    shortPrice,
    subscriptionPay,
} from "./view";

/**
 * One figure, one kind (12 Oct 2026), on Subscriptions and Plans. A gym's
 * ₹2,000 a month plan at 18%:
 *
 * - GST is added: a member pays ₹2,360. Every figure that is money
 *   expected says ₹2,360; the plan's own price says "₹2,000 + GST".
 * - Prices include GST, and a business that isn't registered: every figure
 *   is ₹2,000, exactly as before.
 *
 * The amounts are the API's (`pay`, `gst`); nothing here works one out.
 */

const NOW = new Date("2026-10-12T06:30:00Z");
const TZ = "Asia/Kolkata";

const ADDED: GstOnPrice = {
    mode: "ADDED",
    rate: "18",
    listCents: 200_000,
    gstCents: 36_000,
    payCents: 236_000,
};
const INCLUDED: GstOnPrice = {
    mode: "INCLUDED",
    rate: "18",
    listCents: 200_000,
    gstCents: 30_508,
    payCents: 200_000,
};

/** The three businesses: what the API says of a ₹2,000 price for each. */
const WAYS = {
    added: { gst: ADDED, pay: "2360.00" },
    included: { gst: INCLUDED, pay: "2000.00" },
    unregistered: { gst: null, pay: "2000.00" },
} as const;
type Way = keyof typeof WAYS;

const sub = (way: Way, over: Partial<Subscription> = {}): Subscription => ({
    id: "s1",
    status: "ACTIVE",
    plan: { id: "p1", name: "Gym monthly" },
    contact: { id: "c1", name: "Meera Iyer", email: "meera@example.com" },
    price: "2000.00",
    pay: WAYS[way].pay,
    gst: WAYS[way].gst,
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
    paymentFailed: false,
    failedCharge: null,
    collection: null,
    pendingPlan: null,
    startedAt: "2026-03-02T00:00:00.000Z",
    createdAt: "2026-03-02T00:00:00.000Z",
    ...over,
});

/** A plan with 4 on today's price and 1 still on ₹1,500. */
const plan = (way: Way, over: Partial<Plan> = {}): Plan => {
    const added = way === "added";
    return {
        id: "p1",
        name: "Gym monthly",
        description: null,
        price: "2000.00",
        currency: "INR",
        interval: "MONTH",
        status: "ACTIVE",
        classesPerMonth: null,
        subscriberCount: 5,
        byPrice: [
            {
                price: "2000.00",
                pay: added ? "2360.00" : "2000.00",
                currency: "INR",
                interval: "MONTH",
                count: 4,
                current: true,
            },
            {
                price: "1500.00",
                pay: added ? "1770.00" : "1500.00",
                currency: "INR",
                interval: "MONTH",
                count: 1,
                current: false,
            },
        ],
        monthly: "2000.00",
        // 4 × 2,360 + 1 × 1,770, or 4 × 2,000 + 1 × 1,500.
        monthlyFromMembers: added ? "11210.00" : "9500.00",
        createdAt: "2026-06-01T00:00:00.000Z",
        gstRate: way === "unregistered" ? null : "18",
        gst: WAYS[way].gst,
        ...over,
    };
};

describe("what a member pays a period", () => {
    it("GST is added: the row says ₹2,360, not the ₹2,000 that was typed", () => {
        const s = sub("added");
        expect(subscriptionPay(s)).toBe("2360.00");
        expect(shortPrice(subscriptionPay(s), s.currency, s.interval)).toBe(
            "₹2,360/mo",
        );
    });

    it("prices include GST, and not registered: ₹2,000, as before", () => {
        for (const way of ["included", "unregistered"] as const) {
            const s = sub(way);
            expect(shortPrice(subscriptionPay(s), s.currency, s.interval)).toBe(
                "₹2,000/mo",
            );
        }
    });

    it("an API before the amount to pay reads the price, which was the amount", () => {
        expect(subscriptionPay({ price: "2000.00" })).toBe("2000.00");
    });
});

describe("about what the running subscriptions bring in a month", () => {
    const three = (way: Way) => [sub(way), sub(way), sub(way)];

    it("GST is added: 3 members at ₹2,360 are about ₹7,080", () => {
        expect(monthlyTotal(three("added"))).toEqual({
            amount: 7080,
            currency: "INR",
        });
    });

    it("prices include GST, and not registered: about ₹6,000, as before", () => {
        expect(monthlyTotal(three("included"))?.amount).toBe(6000);
        expect(monthlyTotal(three("unregistered"))?.amount).toBe(6000);
    });

    it("a yearly member counts a twelfth of what they pay", () => {
        // ₹12,000 + ₹2,160 a year is ₹1,180 a month.
        expect(
            monthlyTotal([
                sub("added", {
                    price: "12000.00",
                    pay: "14160.00",
                    interval: "YEAR",
                }),
            ])?.amount,
        ).toBe(1180);
    });
});

describe("the next charge on a subscription's page", () => {
    it("GST is added: ₹2,360 large, and in the sentence beside it", () => {
        const head = headline(sub("added"), "UPI", NOW);
        expect(head.big).toBe("₹2,360");
        expect(head.line).toBe("₹2,360 on 1 Nov · pays by UPI");
    });

    it("prices include GST, and not registered: ₹2,000, as before", () => {
        for (const way of ["included", "unregistered"] as const) {
            const head = headline(sub(way), "UPI", NOW);
            expect(head.big).toBe("₹2,000");
            expect(head.line).toBe("₹2,000 on 1 Nov · pays by UPI");
        }
    });

    it("a booked plan change says what the new plan comes to", () => {
        const head = headline(
            sub("added", {
                pendingPlan: {
                    id: "p2",
                    name: "Gym yearly",
                    price: "20000.00",
                    pay: "23600.00",
                    currency: "INR",
                    interval: "YEAR",
                    from: "2026-10-31T18:30:00.000Z",
                },
            }),
            null,
            NOW,
        );
        expect(head.big).toBe("₹23,600");
    });

    it("one that hasn't started says what its first period comes to", () => {
        const head = headline(
            sub("added", { startsAt: "2026-10-20T18:30:00.000Z" }),
            null,
            NOW,
        );
        expect(head.big).toBe("₹2,360");
    });

    it("a failed renewal says its invoice's total, which is already what is owed", () => {
        const head = headline(
            sub("added", {
                paymentFailed: true,
                failedCharge: {
                    id: "i1",
                    number: "RC/26-27/0012",
                    dueAt: "2026-10-08T00:00:00.000Z",
                    total: "2360.00",
                },
            }),
            null,
            NOW,
        );
        expect(head.big).toBe("₹2,360");
    });
});

describe("keeping an older price", () => {
    const older = (way: Way) =>
        sub(way, {
            price: "1500.00",
            pay: way === "added" ? "1770.00" : "1500.00",
        });

    it("is judged on the two prices the business set", () => {
        expect(olderPrice(older("added"), [plan("added")])).toEqual({
            listPrice: "2000.00",
            listPay: "2360.00",
        });
        expect(olderPrice(sub("added"), [plan("added")])).toBeNull();
    });

    it("GST is added: both sides of the sentence are what is paid", () => {
        const s = older("added");
        const found = olderPrice(s, [plan("added")]);
        expect(found).not.toBeNull();
        expect(keepsLine(s, found ?? { listPay: "" })).toBe(
            "Keeps ₹1,770. The plan is ₹2,360 for new sign-ups",
        );
    });

    it("prices include GST, and not registered: the sentence as before", () => {
        for (const way of ["included", "unregistered"] as const) {
            const s = older(way);
            const found = olderPrice(s, [plan(way)]);
            expect(keepsLine(s, found ?? { listPay: "" })).toBe(
                "Keeps ₹1,500. The plan is ₹2,000 for new sign-ups",
            );
        }
    });
});

describe("a plan's card on the Plans tab", () => {
    it("GST is added: the price says + GST, and what it brings in is what members pay", () => {
        const card = planCard(plan("added"), false);
        expect(card.price).toBe("₹2,000 / month + GST");
        expect(card.subscribers).toBe(
            "5 subscribers · brings in ₹11,210 a month",
        );
        expect(card.olderPrices).toEqual([
            "1 still on ₹1,500 + GST, and they keep it",
        ]);
    });

    it("prices include GST, and not registered: the card as before", () => {
        for (const way of ["included", "unregistered"] as const) {
            const card = planCard(plan(way), false);
            expect(card.price).toBe("₹2,000 / month");
            expect(card.subscribers).toBe(
                "5 subscribers · brings in ₹9,500 a month",
            );
            expect(card.olderPrices).toEqual([
                "1 still on ₹1,500, and they keep it",
            ]);
            expect(olderPriceNotes(plan(way))).toEqual(card.olderPrices);
        }
    });
});

describe("Plan Detail", () => {
    it("GST is added: the header's price says + GST", () => {
        expect(planHeader(plan("added"), false).subline).toBe(
            "₹2,000 + GST every month · 5 people on it",
        );
    });

    it("GST is added: who pays what, and what comes in, are what members pay", () => {
        expect(payRows(plan("added"))).toEqual([
            {
                label: "4 people · current price",
                amount: "₹2,360 / month",
                older: false,
            },
            {
                label: "1 person · older price",
                amount: "₹1,770 / month",
                older: true,
            },
        ]);
        expect(glanceRows(plan("added"), null)[1]).toEqual({
            label: "Coming in a month",
            value: "₹11,210",
        });
    });

    it("GST is added: each subscriber's row says what they pay", () => {
        const [row] = subscriberRows([sub("added")], plan("added"), NOW);
        expect(row.price).toBe("₹2,360 / month");
        expect(row.olderPrice).toBe(false);
    });

    it("prices include GST, and not registered: the page as before", () => {
        for (const way of ["included", "unregistered"] as const) {
            expect(planHeader(plan(way), false).subline).toBe(
                "₹2,000 every month · 5 people on it",
            );
            expect(payRows(plan(way)).map((r) => r.amount)).toEqual([
                "₹2,000 / month",
                "₹1,500 / month",
            ]);
            expect(glanceRows(plan(way), null)[1]?.value).toBe("₹9,500");
            const [row] = subscriberRows([sub(way)], plan(way), NOW);
            expect(row.price).toBe("₹2,000 / month");
        }
    });
});

describe("the Plan Editor's side column and price", () => {
    const form = (over: Partial<PlanForm> = {}): PlanForm => ({
        name: "Gym monthly",
        description: "",
        price: "2000",
        currency: "INR",
        interval: "MONTH",
        classes: "",
        gstRate: "18",
        sacCode: "",
        gstPriceMode: "",
        ...over,
    });
    const ADDS: GstAsk = { asked: true, priceMode: "ADDED" };
    const INCLUDES: GstAsk = { asked: true, priceMode: "INCLUDED" };
    const NOT_ASKED: GstAsk = { asked: false, priceMode: null };

    it("GST is added: the price being set says + GST, and the sum is under it", () => {
        expect(priceToPay(form(), "INR", ADDS)).toBe(
            "₹2,000 + ₹360 GST (18%) = ₹2,360 to pay",
        );
        expect(glance(form(), plan("added"), ADDS)).toEqual([
            { label: "Per month", value: "₹2,000 + GST" },
            { label: "On it now", value: "5" },
            { label: "Coming in a month", value: "₹11,210" },
        ]);
    });

    it("GST is added: who pays what is what each pays", () => {
        expect(whoPays(plan("added"))).toEqual([
            { label: "4 people", value: "₹2,360" },
            { label: "1 person · older price", value: "₹1,770" },
        ]);
    });

    it("the plan's own way wins over the business's, as it is typed", () => {
        expect(
            priceToPay(form({ gstPriceMode: "ADDED" }), "INR", INCLUDES),
        ).toBe("₹2,000 + ₹360 GST (18%) = ₹2,360 to pay");
        expect(
            priceToPay(form({ gstPriceMode: "INCLUDED" }), "INR", ADDS),
        ).toBeNull();
    });

    it("prices include GST, and not registered: nothing more is said", () => {
        for (const [way, ask] of [
            ["included", INCLUDES],
            ["unregistered", NOT_ASKED],
        ] as const) {
            expect(priceToPay(form(), "INR", ask)).toBeNull();
            expect(glance(form(), plan(way), ask)).toEqual([
                { label: "Per month", value: "₹2,000" },
                { label: "On it now", value: "5" },
                { label: "Coming in a month", value: "₹9,500" },
            ]);
            expect(whoPays(plan(way))).toEqual([
                { label: "4 people", value: "₹2,000" },
                { label: "1 person · older price", value: "₹1,500" },
            ]);
        }
    });

    it("no rate chosen yet, or an exempt one: the price is the amount to pay", () => {
        expect(priceToPay(form({ gstRate: "" }), "INR", ADDS)).toBeNull();
        expect(priceToPay(form({ gstRate: "0" }), "INR", ADDS)).toBeNull();
    });
});
