import type { AiTurnOutcome } from "@saroh/database";

import type { AiMessage } from "../providers/provider.port";
import {
    addRound,
    capToolResult,
    costMicroUsd,
    estimateTokens,
    NO_TOKENS,
    trimHistory,
} from "./guards";
import { isCounted, OUTCOME_COUNTED } from "./outcome";

describe("outcome table (spec §3.3)", () => {
    const rows: [AiTurnOutcome, boolean][] = [
        ["ANSWERED", true],
        ["DRAFT", true],
        ["STOPPED_BEFORE", false],
        ["STOPPED_AFTER", true],
        ["FAILED", false],
        ["CUT_OFF", false],
        ["DAILY_LIMIT", false],
        ["NO_ACCESS", true],
        ["RUNNING", false],
    ];
    it.each(rows)("%s counted: %s", (outcome, counted) => {
        expect(isCounted(outcome)).toBe(counted);
    });
    it("has a row for every outcome and no other", () => {
        expect(Object.keys(OUTCOME_COUNTED).sort()).toEqual(
            rows.map(([o]) => o).sort(),
        );
    });
});

describe("trimHistory", () => {
    const old = (n: number): AiMessage[] => [
        { role: "user", text: `q${n}` },
        { role: "assistant", text: "a".repeat(300) },
    ];
    const exchange = (id: string, size: number): AiMessage[] => [
        {
            role: "assistant",
            toolCalls: [{ id, name: "list_bookings", input: {} }],
        },
        {
            role: "tool",
            results: [
                {
                    toolCallId: id,
                    toolName: "list_bookings",
                    output: "r".repeat(size),
                },
            ],
        },
    ];
    const messages: AiMessage[] = [
        ...old(1),
        { role: "user", text: "now" },
        ...exchange("c1", 900),
        ...exchange("c2", 30),
    ];

    it("drops the oldest tool results first, keeping older questions", () => {
        const cap = estimateTokens(messages) - 200;
        const out = trimHistory(messages, cap);
        expect(out).toEqual([
            ...old(1),
            { role: "user", text: "now" },
            ...exchange("c2", 30),
        ]);
    });

    it("then the oldest questions and answers; the newest question and exchange stay", () => {
        const out = trimHistory(messages, 50);
        expect(out).toEqual([
            { role: "user", text: "now" },
            ...exchange("c2", 30),
        ]);
    });

    it("leaves a history under the cap alone", () => {
        expect(trimHistory(messages, 1_000_000)).toEqual(messages);
    });
});

describe("capToolResult", () => {
    it("cuts on a line and says how many more, with the narrow-it line", () => {
        const lines = Array.from({ length: 10 }, (_, i) => `row ${i}`).join(
            "\n",
        );
        const out = capToolResult(lines, 20);
        expect(out).toBe(
            "row 0\nrow 1\nrow 2\n… 7 more not shown; narrow it with a filter.",
        );
        expect(capToolResult("short", 20)).toBe("short");
    });
});

describe("cost", () => {
    // Test prices only (micro-USD per million tokens), chosen to make the sums readable.
    const prices = {
        input: 1_000_000,
        output: 10_000_000,
        cacheRead: 100_000,
        cacheWrite5m: 2_000_000,
        cacheWrite1h: 3_000_000,
    };

    it("prices each kind of token from the raw counts, the writes by lifetime", () => {
        const t = addRound(NO_TOKENS, {
            inputTokens: 1000, // includes 500 read and 300 written
            cacheReadTokens: 500,
            cacheWriteTokens: 300,
            cacheWrite1hTokens: 100,
            outputTokens: 10,
            thinkingTokens: 4,
        });
        expect(t).toMatchObject({
            cacheWrite5mTokens: 200,
            cacheWrite1hTokens: 100,
        });
        // 200 uncached + 50 read + 400 + 300 written + 100 out
        expect(costMicroUsd(t, prices)).toBe(1050);
    });

    it("sums rounds and rounds a fraction up", () => {
        const round = {
            inputTokens: 1,
            cacheReadTokens: 1,
            cacheWriteTokens: 0,
            outputTokens: 0,
            thinkingTokens: 0,
        };
        const t = addRound(addRound(NO_TOKENS, round), round);
        expect(t.inputTokens).toBe(2);
        expect(costMicroUsd(t, prices)).toBe(1);
    });
});
