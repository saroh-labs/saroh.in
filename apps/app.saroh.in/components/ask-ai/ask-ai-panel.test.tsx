// @vitest-environment jsdom
/**
 * Ask AI's panel (plan 2026-11-13-001 U10, boards AIW 11–19): the status
 * line comes first, the answer's text is added as it arrives, Stop is there
 * the moment a question goes and calls the stop route, and each way a
 * question ends says its own words. Free sees the lock; the meter shows
 * only with 20% or less left.
 */
import type { AskAiState } from "@saroh/api-contract";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
    readAskAiState: vi.fn(),
    readAskAiConversation: vi.fn(),
    readAskAiConversations: vi.fn(),
    changeAskAiLanguage: vi.fn(),
    turnOnAskAi: vi.fn(),
    askForMoreQuestions: vi.fn(),
    sendAskAiReport: vi.fn(),
    confirmDraft: vi.fn(),
    undoDraft: vi.fn(),
    redraftDraft: vi.fn(),
}));
vi.mock("@/lib/ask-ai/panel-actions", () => actions);
vi.mock("next/link", () => ({
    default: ({
        href,
        children,
        ...rest
    }: {
        href: string;
        children: React.ReactNode;
    }) => (
        <a href={href} {...rest}>
            {children}
        </a>
    ),
}));

import { AskAiPanel } from "./ask-ai-panel";

const STATE: AskAiState = {
    available: true,
    reason: null,
    upgradeTo: null,
    usage: { used: 10, limit: 100, resetsAt: "2026-12-14T00:00:00.000Z" },
    requestMore: true,
    ownerName: null,
    businessOn: true,
    canSwitch: true,
    language: "MATCH",
};

const encoder = new TextEncoder();
const frame = (e: object) =>
    encoder.encode(`event: x\ndata: ${JSON.stringify(e)}\n\n`);

/** A stream the test feeds one event at a time. */
function feed() {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
        start(c) {
            controller = c;
        },
    });
    return {
        body,
        send: async (e: object) => {
            controller.enqueue(frame(e));
            await settle();
        },
        end: async () => {
            controller.close();
            await settle();
        },
    };
}

const fetchMock = vi.fn();
let root: Root;
let host: HTMLDivElement;

async function settle() {
    await act(async () => {
        for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
    });
}

function render(state: AskAiState | null = STATE) {
    act(() =>
        root.render(
            <AskAiPanel
                state={state}
                businessName="Kesar Salon"
                zone="Asia/Kolkata"
                phone={false}
                onClose={() => undefined}
            />,
        ),
    );
}

const text = () => host.textContent;
const button = (name: string) =>
    Array.from(host.querySelectorAll("button")).find(
        (b) =>
            b.textContent.trim() === name ||
            b.getAttribute("aria-label") === name,
    );

async function ask(question: string) {
    const box = host.querySelector("textarea");
    if (!box) throw new Error("no box");
    act(() => {
        Object.getOwnPropertyDescriptor(
            HTMLTextAreaElement.prototype,
            "value",
        )?.set?.call(box, question);
        box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => button("Ask")?.click());
    await settle();
}

function answerWith(body: ReadableStream<Uint8Array>) {
    fetchMock.mockImplementation((url: string) =>
        Promise.resolve(
            url === "/api/ask-ai/turns"
                ? new Response(body, {
                      headers: { "content-type": "text/event-stream" },
                  })
                : Response.json({ stopped: true }),
        ),
    );
}

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    actions.readAskAiState.mockResolvedValue(null);
    actions.readAskAiConversation.mockResolvedValue({
        id: "c1",
        agent: "ask-ai",
        title: "x",
        lastMessageAt: "",
        createdAt: "",
        messages: [
            { id: "m1", role: "USER", outcome: null, text: "q", createdAt: "" },
            {
                id: "m2",
                role: "ASSISTANT",
                outcome: "ANSWERED",
                text: "a",
                createdAt: "",
            },
        ],
    });
    actions.readAskAiConversations.mockResolvedValue({
        data: [],
        nextCursor: null,
    });
});
afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
});

describe("asking", () => {
    it("shows the status line first, then adds the text as it arrives", async () => {
        const s = feed();
        answerWith(s.body);
        render();
        await ask("How many bookings this week?");

        await s.send({ type: "turn", turnId: "t1", conversationId: "c1" });
        await s.send({
            type: "status",
            tool: "list_bookings",
            words: "Reading this week's bookings…",
        });
        expect(text()).toContain("Reading this week's bookings…");

        await s.send({ type: "text-delta", text: "46 bookings " });
        await s.send({ type: "text-delta", text: "this week." });
        expect(text()).toContain("46 bookings this week.");
        // The status line has gone once the answer started.
        expect(text()).not.toContain("Reading this week's bookings…");
        expect(host.querySelector('[aria-live="polite"]')).not.toBeNull();

        await s.send({
            type: "done",
            turnId: "t1",
            outcome: "ANSWERED",
            counted: true,
            usage: { rounds: 1, inputTokens: 1, outputTokens: 1 },
        });
        await s.end();
        expect(button("Stop the answer")).toBeUndefined();
        // Report reads the saved answer's id.
        expect(actions.readAskAiConversation).toHaveBeenCalledWith("c1");
        expect(text()).toContain("Report this answer");
    });

    it("shows Stop at once, and Stop calls the stop route", async () => {
        const s = feed();
        answerWith(s.body);
        render();
        await ask("Kal ke appointments?");
        // Before any event arrives.
        expect(button("Stop the answer")).toBeDefined();

        await s.send({ type: "turn", turnId: "t9", conversationId: "c1" });
        act(() => button("Stop the answer")?.click());
        await settle();
        expect(fetchMock).toHaveBeenCalledWith("/api/ask-ai/turns/t9/stop", {
            method: "POST",
        });
    });

    it("a Stop pressed before the turn's id arrives is sent once it does", async () => {
        const s = feed();
        answerWith(s.body);
        render();
        await ask("Kal?");
        act(() => button("Stop the answer")?.click());
        await s.send({ type: "turn", turnId: "t2", conversationId: null });
        expect(fetchMock).toHaveBeenCalledWith("/api/ask-ai/turns/t2/stop", {
            method: "POST",
        });
    });
});

async function ended(events: object[]) {
    const s = feed();
    answerWith(s.body);
    render();
    await ask("Question?");
    await s.send({ type: "turn", turnId: "t1", conversationId: "c1" });
    for (const e of events) await s.send(e);
    await s.end();
}

const done = (outcome: string) => ({
    type: "done",
    turnId: "t1",
    outcome,
    counted: outcome === "STOPPED_AFTER",
    usage: { rounds: 0, inputTokens: 0, outputTokens: 0 },
});

describe("how a question ends", () => {
    it("stopped before any text: didn't use a question, with Edit and Ask again", async () => {
        await ended([done("STOPPED_BEFORE")]);
        expect(text()).toContain("Stopped. This didn't use a question.");
        expect(button("Edit question")).toBeDefined();
        expect(button("Ask again")).toBeDefined();
    });

    it("stopped mid-answer: what arrived stays, and it used a question", async () => {
        await ended([
            { type: "text-delta", text: "38 members renewed" },
            done("STOPPED_AFTER"),
        ]);
        expect(text()).toContain("38 members renewed");
        expect(text()).toContain("Stopped. This used a question.");
        expect(text()).not.toContain("Report this answer");
    });

    it("cut off: what arrived stays, it didn't count, Try again", async () => {
        await ended([
            { type: "text-delta", text: "7 root canals" },
            { type: "error", reason: "provider" },
            done("CUT_OFF"),
        ]);
        expect(text()).toContain("7 root canals");
        expect(text()).toContain(
            "This answer was cut off. This didn't use a question.",
        );
        expect(button("Try again")).toBeDefined();
    });

    it("Edit question puts it back in the box", async () => {
        await ended([done("STOPPED_BEFORE")]);
        act(() => button("Edit question")?.click());
        expect(host.querySelector("textarea")?.value).toBe("Question?");
    });
});

describe("refusals say their own words", () => {
    const cases: [object, string[]][] = [
        [
            { reason: "unavailable" },
            [
                "Ask AI isn't available right now.",
                "This didn't use a question.",
            ],
        ],
        [
            { reason: "locked", upgradeTo: "Grow" },
            ["Ask AI comes with Grow.", "See plans"],
        ],
        [{ reason: "no-permission" }, ["Ask AI isn't part of your role."]],
        [
            { reason: "business-off", askName: "Rahul Sethi" },
            [
                "Ask AI is off for Kesar Salon.",
                "Ask Rahul Sethi if you need it back on.",
                "Ask AI is off. Your conversations stay readable.",
            ],
        ],
        [
            {
                reason: "allowance",
                limit: 5,
                resetsAt: "2026-12-14T00:00:00.000Z",
                requestMore: true,
                askName: null,
            },
            [
                "You've used all of this period's questions.",
                "They reset on 14 Dec.",
                "Request more",
            ],
        ],
        [
            {
                reason: "allowance",
                limit: 5,
                resetsAt: "2026-12-14T00:00:00.000Z",
                requestMore: false,
                askName: "Dr. Kavita Mehra",
            },
            ["Dr. Kavita Mehra can request more."],
        ],
        [
            { reason: "daily-limit", scope: "business" },
            [
                "You've reached today's Ask AI limit. It resets tomorrow.",
                "This didn't use a question.",
            ],
        ],
        [
            { reason: "daily-limit", scope: "saroh" },
            ["Ask AI isn't available right now."],
        ],
    ];
    for (const [refusal, words] of cases) {
        it(`${(refusal as { reason: string }).reason}${"askName" in refusal && refusal.askName ? ", someone else asks" : ""}`, async () => {
            await ended([{ type: "refused", refusal }, done("FAILED")]);
            for (const w of words) expect(text()).toContain(w);
        });
    }

    it("at the limit the box is paused", async () => {
        await ended([
            {
                type: "refused",
                refusal: {
                    reason: "allowance",
                    limit: 5,
                    resetsAt: "2026-12-14T00:00:00.000Z",
                    requestMore: true,
                    askName: null,
                },
            },
            done("FAILED"),
        ]);
        expect(host.querySelector("textarea")?.disabled).toBe(true);
        expect(host.querySelector("textarea")?.placeholder).toBe(
            "Typed questions are paused",
        );
    });
});

describe("the panel's states", () => {
    it("Free sees the lock and the plan, no box", () => {
        render({
            ...STATE,
            available: false,
            reason: "locked",
            upgradeTo: "Grow",
            usage: null,
        });
        expect(text()).toContain("Ask AI comes with Grow");
        expect(text()).toContain("Example · sample data, not yours");
        expect(host.querySelector("textarea")).toBeNull();
    });

    it("hides the meter with more than 20% left", async () => {
        const s = feed();
        answerWith(s.body);
        render({
            ...STATE,
            usage: {
                used: 79,
                limit: 100,
                resetsAt: "2026-12-14T00:00:00.000Z",
            },
        });
        await ask("Q?");
        await s.send(done("ANSWERED"));
        await s.end();
        expect(text()).not.toContain("left · resets");
    });

    it("shows what's left with 20% or less", async () => {
        const s = feed();
        answerWith(s.body);
        render({
            ...STATE,
            usage: {
                used: 81,
                limit: 100,
                resetsAt: "2026-12-14T00:00:00.000Z",
            },
        });
        await ask("Q?");
        await s.send(done("ANSWERED"));
        await s.end();
        expect(text()).toContain("19 questions left · resets 14 Dec");
    });

    it("opens with the Hinglish placeholder and the privacy line", () => {
        render();
        expect(host.querySelector("textarea")?.placeholder).toBe(
            "Ask anything, in English or Hinglish",
        );
        expect(text()).toContain(
            "go to Anthropic, our AI provider, outside India",
        );
    });

    it("off for the business: Turn on for an Owner, conversations listed", async () => {
        render({
            ...STATE,
            available: false,
            reason: "business-off",
            businessOn: false,
            usage: null,
        });
        await settle();
        expect(text()).toContain("Ask AI is off for Kesar Salon");
        expect(button("Turn on")).toBeDefined();
        expect(actions.readAskAiConversations).toHaveBeenCalled();
        expect(host.querySelector("textarea")).toBeNull();
    });
});
