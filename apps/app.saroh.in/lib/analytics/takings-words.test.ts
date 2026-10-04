import { describe, expect, it } from "vitest";

import { takingsFigures } from "./takings-figures";
import {
    chartLabel,
    dayMonth,
    ordersHref,
    otherCurrencyNote,
    soFarReadout,
    sourceLine,
    sparkLabel,
    splitLabel,
    takingsAnswers,
    takingsSubtitle,
    takingsTiles,
    weekdayDayMonth,
    weekReadout,
} from "./takings-words";
import { takingsRead } from "./takings.fixture";

/**
 * The answers Insights writes (DEC-075), pinned word for word: each figure
 * with its window, a change only against a baseline, level for flat, and
 * an honest sentence for a business that has nothing to show yet, the week
 * in progress only against the same days of last week, "Anything to watch?"
 * only on a signal, and every figure with rows behind it linked to them.
 */

const SO_FAR = {
    start: "2026-09-28",
    through: "2026-09-30",
    takingsMinor: 0,
    orders: 0,
    payments: 0,
    sameDaysLastWeekMinor: 0,
    sameDaysLastWeekPayments: 0,
};

const STEADY = [
    10_000, 12_000, 11_000, 9_000, 10_000, 10_000, 10_000, 10_000, 11_000,
    12_000, 15_000, 9_000,
];

const answersFor = (...args: Parameters<typeof takingsRead>) =>
    takingsAnswers(takingsFigures(takingsRead(...args)));

const answer = (
    list: ReturnType<typeof takingsAnswers>,
    key: string,
): string | undefined => list.find((a) => a.key === key)?.answer;

describe("takingsAnswers", () => {
    it("answers the design's questions from the figures, each with its window", () => {
        const answers = answersFor(STEADY);
        expect(answers.map((a) => a.question)).toEqual([
            "How is this week going?",
            "How was the last month?",
            "Which week was best?",
            "Anything to watch?",
        ]);
        expect(answer(answers, "now")).toBe(
            "Nothing has come in since Monday 28 Sep.",
        );
        expect(answer(answers, "month")).toBe(
            "You took ₹47,000 in the last four weeks (31 Aug – 27 Sep), up 18% on the four weeks before.",
        );
        expect(answer(answers, "best")).toBe(
            "The week of 14 Sep, at ₹15,000 — about 40% above your usual week (the twelve-week average).",
        );
        // Nothing below the usual week by much, no slide, one place.
        expect(answer(answers, "watch")).toBe(
            "Nothing unusual in the last four weeks.",
        );
        // Each figure with rows opens them.
        expect(answers.find((a) => a.key === "best")?.link).toEqual({
            href: "/commerce/orders?date=custom&from=2026-09-14&to=2026-09-20&payment=paid",
            label: "See the orders placed that week",
        });
        // Nothing this week: no link to an empty list.
        expect(answers.find((a) => a.key === "now")?.link).toBeUndefined();
    });

    it("says how this week is going against the same days of last week", () => {
        const at = (over: Partial<typeof SO_FAR>) =>
            answer(
                answersFor(STEADY, { thisWeek: { ...SO_FAR, ...over } }),
                "now",
            );
        expect(
            at({
                takingsMinor: 3_10_400_00,
                payments: 41,
                sameDaysLastWeekMinor: 2_77_142_00,
                sameDaysLastWeekPayments: 30,
            }),
        ).toBe(
            "You've taken ₹3,10,400 since Monday 28 Sep, from 41 payments — 12% ahead of the same days last week.",
        );
        expect(
            at({
                takingsMinor: 5_000_00,
                payments: 1,
                sameDaysLastWeekMinor: 10_000_00,
                sameDaysLastWeekPayments: 4,
            }),
        ).toBe(
            "You've taken ₹5,000 since Monday 28 Sep, from 1 payment — 50% behind the same days last week.",
        );
        // Too few payments last week to compare: the figure, and no claim.
        expect(
            at({
                takingsMinor: 5_000_00,
                payments: 2,
                sameDaysLastWeekMinor: 9_000_00,
                sameDaysLastWeekPayments: 2,
            }),
        ).toBe("You've taken ₹5,000 since Monday 28 Sep, from 2 payments.");
        // On the Monday itself, it is today.
        expect(
            at({
                through: "2026-09-28",
                sameDaysLastWeekMinor: 4_000_00,
                sameDaysLastWeekPayments: 3,
            }),
        ).toBe(
            "Nothing has come in today (Monday 28 Sep). The same days last week took ₹4,000.",
        );
        const link = answersFor(STEADY, {
            thisWeek: { ...SO_FAR, takingsMinor: 100, payments: 1 },
        }).find((a) => a.key === "now")?.link;
        expect(link).toEqual({
            href: "/commerce/orders?date=custom&from=2026-09-28&to=2026-09-30&payment=paid",
            label: "See this week's orders",
        });
    });

    it("says the best week once, and that it was last week when it was", () => {
        const answers = answersFor([...STEADY.slice(0, 11), 20_000]);
        expect(answer(answers, "best")).toBe(
            "Last week (21 Sep) was your best of the twelve, at ₹20,000 — about 71% above your usual week (the twelve-week average).",
        );
        expect(answer(answers, "watch")).not.toMatch(/best/);
    });

    it("says down, and level for a change that rounds to nothing", () => {
        const down = answersFor([
            ...STEADY.slice(0, 8),
            8_000,
            8_000,
            8_000,
            8_000,
        ]);
        expect(answer(down, "month")).toBe(
            "You took ₹32,000 in the last four weeks (31 Aug – 27 Sep), down 20% on the four weeks before.",
        );
        const level = answersFor([
            ...STEADY.slice(0, 8),
            10_010,
            9_990,
            10_000,
            10_020,
        ]);
        expect(answer(level, "month")).toBe(
            "You took ₹40,020 in the last four weeks (31 Aug – 27 Sep), level with the four weeks before.",
        );
    });

    it("says why there is no comparing, never 0%", () => {
        const young = answersFor(
            [0, 0, 0, 0, 0, 0, 5_000, 6_000, 7_000, 8_000, 9_000, 9_500],
            { firstSaleOn: "2026-08-19" },
        );
        expect(answer(young, "month")).toBe(
            "You took ₹33,500 in the last four weeks (31 Aug – 27 Sep) — your first weeks on record, so there's nothing earlier to compare.",
        );
        expect(answer(young, "best")).toBe(
            "Last week (21 Sep) was your best of the twelve, at ₹9,500 — about 28% above your usual week (the average of your 6 weeks on record).",
        );
        // Growing every week: nothing to watch.
        expect(answer(young, "watch")).toBe(
            "Nothing unusual in the last four weeks.",
        );

        const thin = answersFor(STEADY, {
            orders: [3, 3, 3, 3, 1, 0, 1, 0, 3, 3, 3, 3],
        });
        expect(answer(thin, "month")).toBe(
            "You took ₹47,000 in the last four weeks (31 Aug – 27 Sep); too little came in the four weeks before to compare.",
        );
    });

    it("names the places money came from, and skips the question when there is only one", () => {
        const split = { "location:hill": 6_600, online: 3_400 };
        const two = answersFor(
            STEADY.map(() => 10_000),
            {
                split: STEADY.map(() => split),
            },
        );
        expect(answer(two, "where")).toBe(
            "Over the last four weeks, 66% at Hill Road and 34% online.",
        );
        const three = answersFor(
            STEADY.map(() => 10_000),
            {
                split: STEADY.map(() => ({
                    "location:hill": 5_000,
                    "location:bandra": 3_000,
                    invoices: 2_000,
                })),
            },
        );
        expect(answer(three, "where")).toBe(
            "Over the last four weeks, 50% at Hill Road, 30% at Bandra and 20% by invoice.",
        );
        expect(answer(answersFor(STEADY), "where")).toBeUndefined();
    });

    it("watches only for a signal: a slide, a dip or a place dropping", () => {
        // Three weeks falling, last below the usual: the slide, worst first.
        const slide = answersFor([
            ...STEADY.slice(0, 9),
            14_000,
            11_000,
            8_000,
        ]);
        expect(answer(slide, "watch")).toBe(
            "Sales have fallen three weeks running, from ₹14,000 in the week of 7 Sep to ₹8,000 last week — down 43%.",
        );
        expect(slide.find((a) => a.key === "watch")?.link).toEqual({
            href: "/commerce/orders?date=custom&from=2026-09-21&to=2026-09-27&payment=paid",
            label: "See last week's orders",
        });
        // A week 30% or more below the usual one.
        const dip = answersFor([...STEADY.slice(0, 11), 5_000]);
        expect(answer(dip, "watch")).toBe(
            "Last week took ₹5,000, about 52% below your usual week.",
        );
        const earlier = answersFor([
            ...STEADY.slice(0, 9),
            5_000,
            12_000,
            12_000,
        ]);
        expect(answer(earlier, "watch")).toBe(
            "The week of 7 Sep took ₹5,000, about 51% below your usual week.",
        );
        // One place falling away while the total holds.
        const before = { "location:hill": 6_000, online: 4_000 };
        const after = { "location:hill": 8_500, online: 1_500 };
        const place = answersFor(
            STEADY.map(() => 10_000),
            {
                split: STEADY.map((_, i) => (i >= 8 ? after : before)),
            },
        );
        expect(answer(place, "watch")).toBe(
            "Online orders took 63% less than in the four weeks before.",
        );
    });

    it("waits for four weeks on record before watching", () => {
        const answers = answersFor(
            [0, 0, 0, 0, 0, 0, 0, 0, 0, 5_000, 6_000, 1_000],
            { firstSaleOn: "2026-09-08" },
        );
        expect(answer(answers, "watch")).toBeUndefined();
    });

    it("gives a business with no sales one honest sentence, not ₹0", () => {
        const none = answersFor(Array<number>(12).fill(0), {
            firstSaleOn: null,
        });
        // Said once by the page, with what to do: no answers at all.
        expect(none).toEqual([]);
        const first = answersFor(Array<number>(12).fill(0), {
            firstSaleOn: "2026-09-29",
            thisWeek: { ...SO_FAR, takingsMinor: 2_400_00, payments: 3 },
        });
        expect(first.map((a) => a.answer)).toEqual([
            "Your first sales came in this week: ₹2,400 so far, from 3 payments. Each week joins the figures once it ends, on Sunday.",
        ]);
    });

    it("says nothing came in when the last four weeks were empty", () => {
        const quiet = answersFor([...STEADY.slice(0, 8), 0, 0, 0, 0]);
        expect(answer(quiet, "month")).toBe(
            "Nothing came in during the last four weeks (31 Aug – 27 Sep), against ₹40,000 in the four weeks before.",
        );
    });
});

describe("takingsTiles", () => {
    it("lays out the four figures with their windows", () => {
        const tiles = takingsTiles(
            takingsFigures(
                takingsRead(STEADY, {
                    orders: [...Array<number>(8).fill(3), 10, 10, 10, 17],
                    locations: 2,
                }),
            ),
        );
        const last4 =
            "/commerce/orders?date=custom&from=2026-08-31&to=2026-09-27&payment=paid";
        expect(tiles).toEqual([
            {
                key: "takings",
                label: "Sales, 4 weeks",
                value: "₹47,000",
                note: "Up 18% on the four before.",
                href: last4,
            },
            {
                key: "orders",
                label: "Orders, 4 weeks",
                value: "47",
                note: "All of the sales at Hill Road.",
                href: last4,
            },
            {
                key: "best",
                label: "Best week",
                value: "14 Sep",
                note: "₹15,000 — the marked bar.",
                href: "/commerce/orders?date=custom&from=2026-09-14&to=2026-09-20&payment=paid",
            },
            {
                key: "average",
                label: "Average order, 4 weeks",
                value: "₹1,000",
                note: "Per paid order, last four weeks.",
                href: last4,
            },
        ]);
    });

    it("counts the places orders came from in the average's note", () => {
        const split = { "location:hill": 6_000, online: 4_000 };
        const tiles = takingsTiles(
            takingsFigures(
                takingsRead(
                    STEADY.map(() => 10_000),
                    {
                        split: STEADY.map(() => split),
                    },
                ),
            ),
        );
        expect(tiles[3].note).toBe(
            "Per paid order, last four weeks, from 2 places.",
        );
        expect(tiles[1].note).toBe("60% of sales at Hill Road.");
    });

    it("reads N/A without a baseline, and a dash where there is nothing to show", () => {
        const young = takingsTiles(
            takingsFigures(
                takingsRead(
                    [
                        0, 0, 0, 0, 0, 0, 5_000, 6_000, 7_000, 8_000, 9_000,
                        9_500,
                    ],
                    { firstSaleOn: "2026-08-19" },
                ),
            ),
        );
        expect(young[0].note).toBe("N/A: your first weeks on record.");
        const none = takingsTiles(
            takingsFigures(
                takingsRead(Array<number>(12).fill(0), { firstSaleOn: null }),
            ),
        );
        expect(none[2]).toMatchObject({
            value: "—",
            note: "No week of the twelve took money.",
        });
        expect(none[3]).toMatchObject({
            value: "—",
            note: "No paid orders to average.",
        });
    });
});

describe("labels", () => {
    it("says the chart and the split for a screen reader", () => {
        const f = takingsFigures(takingsRead(STEADY));
        expect(chartLabel(f)).toBe(
            "Sales for the twelve weeks 6 Jul – 27 Sep, highest in the week of 14 Sep at ₹15,000.",
        );
        expect(
            splitLabel([
                {
                    key: "location:hill",
                    kind: "LOCATION",
                    name: "Hill Road",
                    takingsMinor: 66,
                    percent: 66,
                },
                {
                    key: "online",
                    kind: "ONLINE",
                    name: null,
                    takingsMinor: 34,
                    percent: 34,
                },
            ]),
        ).toBe("Hill Road 66 per cent, online 34 per cent.");
        expect(dayMonth("2026-09-14")).toBe("14 Sep");
        expect(takingsSubtitle(f)).toBe(
            "This week so far, and the twelve whole weeks 6 Jul – 27 Sep.",
        );
        expect(sparkLabel(f)).toBe(
            "Sales for the twelve weeks 6 Jul – 27 Sep, highest in the week of 14 Sep at ₹15,000. The last four weeks (31 Aug – 27 Sep) are drawn darkest, the four before them (3 Aug – 30 Aug) lighter.",
        );
    });

    it("reads each bar out, and says what the figures were counted from", () => {
        const f = takingsFigures(
            takingsRead(STEADY, {
                thisWeek: { ...SO_FAR, takingsMinor: 1_200_00, orders: 1 },
            }),
        );
        expect(weekReadout(f.bars[10], f.currency)).toBe(
            "Week of 14 Sep · ₹15,000 · 15 paid orders",
        );
        expect(soFarReadout(f)).toBe(
            "This week so far (28 Sep – 30 Sep) · ₹1,200 · 1 paid order",
        );
        expect(sourceLine(f)).toBe(
            "From 47 payments in the last four weeks: 47 paid orders and 0 paid invoices, less refunds.",
        );
        expect(weekdayDayMonth("2026-10-04")).toBe("Sunday 4 Oct");
        expect(ordersHref("2026-09-28", "2026-10-04")).toBe(
            "/commerce/orders?date=custom&from=2026-09-28&to=2026-10-04&payment=paid",
        );
    });

    it("names money in another currency rather than adding it in", () => {
        const f = takingsFigures(
            takingsRead(STEADY, { otherCurrencies: ["USD"] }),
        );
        expect(otherCurrencyNote(f)).toBe(
            "Money taken in USD isn't counted here.",
        );
        expect(
            otherCurrencyNote(takingsFigures(takingsRead(STEADY))),
        ).toBeNull();
    });
});
