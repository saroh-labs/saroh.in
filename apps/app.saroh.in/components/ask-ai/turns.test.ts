import type { AskAiEvent } from "@saroh/api-contract";
import { describe, expect, it } from "vitest";

import type { Turn } from "./thread";
import {
    applyEvent,
    askPageHref,
    endLost,
    infoCardsOf,
    matching,
    readsSaved,
} from "./turns";

/** Ask AI's conversation as data (DEC-183): no render needed. */
const turn = (change: Partial<Turn> = {}): Turn => ({
    key: "t1",
    question: "q",
    text: "",
    cards: [],
    running: true,
    ...change,
});
const fold = (events: AskAiEvent[], from = turn()) =>
    events.reduce(applyEvent, from);

describe("applyEvent", () => {
    it("adds the text as it arrives and keeps the status line's tools", () => {
        const t = fold([
            { type: "turn", turnId: "x1", conversationId: "c1" },
            { type: "status", words: "Reading bookings…", tool: "start" },
            { type: "status", words: "Reading bookings…", tool: "bookings" },
            { type: "text-delta", text: "You have " },
            { type: "text-delta", text: "12." },
        ] as AskAiEvent[]);
        expect(t.turnId).toBe("x1");
        expect(t.status).toBe("Reading bookings…");
        expect(t.tools).toEqual(["bookings"]);
        expect(t.text).toBe("You have 12.");
    });

    it("leaves out a card it doesn't know, and ends on done", () => {
        const t = fold([
            { type: "card", kind: "draft", data: { nonsense: true } },
            { type: "done", outcome: "ANSWERED", counted: true },
        ] as AskAiEvent[]);
        expect(t.cards).toEqual([]);
        expect(t.running).toBe(false);
        expect(t.outcome).toBe("ANSWERED");
        expect(t.counted).toBe(true);
    });

    it("keeps refusals, errors and next steps", () => {
        const t = fold([
            { type: "refused", refusal: { reason: "business-off" } },
            { type: "error", reason: "provider" },
            { type: "next", items: [] },
        ] as unknown as AskAiEvent[]);
        expect(t.refusal?.reason).toBe("business-off");
        expect(t.error).toBe("provider");
        expect(t.next).toEqual([]);
    });
});

describe("endLost", () => {
    it("a dropped stream keeps what arrived and never says it was used", () => {
        expect(endLost(turn({ text: "Half" }))).toMatchObject({
            running: false,
            outcome: "CUT_OFF",
            lost: true,
        });
        expect(endLost(turn())).toMatchObject({ outcome: "FAILED" });
        expect(counted(endLost(turn()))).toBeUndefined();
    });

    it("leaves a finished turn alone", () => {
        const done = turn({ running: false, outcome: "ANSWERED" });
        expect(endLost(done)).toBe(done);
    });
});
const counted = (t: Turn) => t.counted;

it("reads the saved answer after an answer, a draft, or a dropped stream", () => {
    expect(readsSaved("ANSWERED")).toBe(true);
    expect(readsSaved("DRAFT")).toBe(true);
    expect(readsSaved(undefined)).toBe(true);
    expect(readsSaved("FAILED")).toBe(false);
});

it("askPageHref names the conversation open", () => {
    expect(askPageHref(null)).toBe("/ask");
    expect(askPageHref("c 1")).toBe("/ask?c=c%201");
});

it("infoCardsOf drops what isn't a card", () => {
    expect(infoCardsOf(undefined)).toEqual([]);
    expect(infoCardsOf([{ kind: "nope" }])).toEqual([]);
});

it("matching finds conversations by title, ignoring case and spaces", () => {
    const list = [
        { id: "a", title: "Bookings this week" },
        { id: "b", title: null },
    ] as never;
    expect(matching(list, "  BOOKINGS ").map((c) => c.id)).toEqual(["a"]);
    expect(matching(list, "")).toHaveLength(2);
});
