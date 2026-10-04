import { describe, expect, it } from "vitest";

import { takingsFigures } from "./takings-figures";
import {
    chartLabel,
    dayMonth,
    otherCurrencyNote,
    splitLabel,
    takingsAnswers,
    takingsSubtitle,
    takingsTiles,
} from "./takings-words";
import { takingsRead } from "./takings.fixture";

/**
 * The answers Insights writes (DEC-075), pinned word for word: each figure
 * with its window, a change only against a baseline, level for flat, and
 * an honest sentence for a business that has nothing to show yet.
 */

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
            "How was the last month?",
            "Which week was best?",
            "Anything to watch?",
        ]);
        expect(answer(answers, "month")).toBe(
            "You took ₹47,000 in the last four weeks (31 Aug – 27 Sep), up 18% on the four weeks before.",
        );
        expect(answer(answers, "best")).toBe(
            "The week of 14 Sep, at ₹15,000 — about 40% above your usual week (the twelve-week average).",
        );
        expect(answer(answers, "watch")).toBe(
            "The quietest week was the week of 27 Jul, at ₹9,000. Last week took ₹9,000, 40% below your best week, the one before it.",
        );
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
            "The week of 21 Sep, at ₹9,500 — about 28% above your usual week (the average of your 6 weeks on record).",
        );
        // Last week was the best: nothing to say against it.
        expect(answer(young, "watch")).toBe(
            "The quietest week was the week of 17 Aug, at ₹5,000. Last week was your best of the twelve.",
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

    it("says when the quietest week is last week, against the usual", () => {
        const answers = answersFor([...STEADY.slice(0, 11), 5_000]);
        expect(answer(answers, "watch")).toBe(
            "The quietest week was last week, at ₹5,000, 52% below your usual week.",
        );
        const nothing = answersFor([...STEADY.slice(0, 11), 0]);
        expect(answer(nothing, "watch")).toBe("Last week took nothing.");
    });

    it("gives a business with no sales one honest sentence, not ₹0", () => {
        const none = answersFor(Array<number>(12).fill(0), {
            firstSaleOn: null,
        });
        expect(none).toEqual([
            {
                key: "month",
                question: "How was the last month?",
                answer: "No money has come in yet. Paid orders and paid invoices show here from the week they're paid.",
            },
        ]);
        const first = answersFor(Array<number>(12).fill(0), {
            firstSaleOn: "2026-09-29",
        });
        expect(first.map((a) => a.answer)).toEqual([
            "Your first takings came in this week. Each week shows here once it ends, on Sunday.",
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
        expect(tiles).toEqual([
            {
                key: "takings",
                label: "Takings, 4 weeks",
                value: "₹47,000",
                note: "Up 18% on the four before.",
            },
            {
                key: "orders",
                label: "Orders, 4 weeks",
                value: "47",
                note: "All of the takings at Hill Road.",
            },
            {
                key: "best",
                label: "Best week",
                value: "14 Sep",
                note: "₹15,000 — the marked bar.",
            },
            {
                key: "average",
                label: "Average order, 4 weeks",
                value: "₹1,000",
                note: "Across 47 orders.",
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
        expect(tiles[3].note).toMatch(/^Across \d+ orders, from 2 places\.$/);
        expect(tiles[1].note).toBe("60% of takings at Hill Road.");
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
            "Takings for the twelve weeks 6 Jul – 27 Sep, highest in the week of 14 Sep at ₹15,000.",
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
            "The twelve weeks 6 Jul – 27 Sep, Monday to Sunday in your time zone. A week counts once it ends.",
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
