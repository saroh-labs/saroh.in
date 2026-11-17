// @vitest-environment jsdom
/**
 * Ask AI's panel (plan 2026-11-13-001 U10, boards AIW 11–19): the status
 * line comes first, the answer's text is added as it arrives, Stop is there
 * the moment a question goes and calls the stop route, and each way a
 * question ends says its own words. Free sees the lock; the meter shows
 * only with 20% or less left.
 */
import type {
    AskAiConversation,
    AskAiInfoCard,
    AskAiState,
} from "@saroh/api-contract";
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
    bookFromAnswer: vi.fn(),
}));
vi.mock("@/lib/ask-ai/panel-actions", () => actions);
vi.mock("@/lib/customers/actions", () => ({
    findCustomers: vi.fn().mockResolvedValue({ ok: true, results: [] }),
    readCustomerAttention: vi.fn(),
}));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
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

import { customerPage } from "@/lib/ask-ai/page-hints";
import { AskAiPageIs } from "./ask-ai-page";
import { AskAiPanel, turnsOf } from "./ask-ai-panel";

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
                "This month's 5 questions are used.",
                "They come back on 14 Dec. This didn't use a question.",
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
            "Paused until 14 Dec",
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
        expect(text()).toContain("Examples, not Kesar Salon's own.");
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

    it("opens on the whole business with the privacy line", () => {
        render();
        expect(host.querySelector("textarea")?.placeholder).toBe(
            "Ask, or say what to do",
        );
        expect(text()).toContain("Ask about Kesar Salon");
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

const SUMMARY = (id: string, title: string) => ({
    id,
    agent: "ask-ai",
    title,
    lastMessageAt: "2026-11-14T05:00:00.000Z",
    createdAt: "2026-11-14T05:00:00.000Z",
});

describe("the full page, /ask (board AI 9)", () => {
    it("Expand on a desk opens the page with the conversation, and closes the panel", () => {
        const onClose = vi.fn();
        act(() =>
            root.render(
                <AskAiPanel
                    state={STATE}
                    businessName="Kesar Salon"
                    zone="Asia/Kolkata"
                    phone={false}
                    onClose={onClose}
                    conversation={{
                        ...SUMMARY("c 1", "Keratin"),
                        messages: [],
                    }}
                />,
            ),
        );
        act(() => button("Open as a full page")?.click());
        expect(router.push).toHaveBeenCalledWith("/ask?c=c%201");
        expect(onClose).toHaveBeenCalled();
    });

    function renderPage(state: AskAiState = STATE) {
        act(() =>
            root.render(
                <AskAiPanel
                    layout="page"
                    state={state}
                    businessName="Kesar Salon"
                    zone="Asia/Kolkata"
                    phone={false}
                    conversations={[
                        SUMMARY("c1", "Add a keratin service"),
                        SUMMARY("c2", "Who hasn't paid"),
                    ]}
                />,
            ),
        );
    }

    it("lists the conversations beside the conversation, and loads the one picked", async () => {
        renderPage();
        expect(text()).toContain("Add a keratin service");
        expect(text()).toContain("Who hasn't paid");
        expect(button("Close Ask AI")).toBeUndefined();
        expect(button("Open as a full page")).toBeUndefined();
        const row = () =>
            Array.from(host.querySelectorAll("nav button")).find((b) =>
                b.textContent.includes("Add a keratin service"),
            );
        act(() => (row() as HTMLButtonElement).click());
        await settle();
        expect(actions.readAskAiConversation).toHaveBeenCalledWith("c1");
        expect(row()?.getAttribute("aria-current")).toBe("true");
        expect(host.querySelector("#ask-ai-page h2")?.textContent).toBe(
            "Add a keratin service",
        );
        expect(window.location.search).toBe("?c=c1");
        // The new address is read again, so Back to it isn't a stale copy.
        expect(router.refresh).toHaveBeenCalled();
    });

    it("reads the page again once a turn ends, so Back shows its card", async () => {
        window.history.replaceState(null, "", "/ask?c=c1");
        act(() =>
            root.render(
                <AskAiPanel
                    layout="page"
                    state={STATE}
                    businessName="Kesar Salon"
                    zone="Asia/Kolkata"
                    phone={false}
                    conversation={{
                        id: "c1",
                        agent: "ask-ai",
                        title: "x",
                        lastMessageAt: "",
                        createdAt: "",
                        messages: [],
                    }}
                    conversations={[]}
                />,
            ),
        );
        expect(router.refresh).not.toHaveBeenCalled();
        const stream = feed();
        answerWith(stream.body);
        await ask("orders last month");
        await stream.send({ type: "turn", turnId: "t1", conversationId: "c1" });
        await stream.send({ type: "text-delta", text: "Here." });
        expect(router.refresh).not.toHaveBeenCalled();
        await stream.send({ type: "done", outcome: "ANSWERED" });
        await stream.end();
        await settle();
        expect(router.refresh).toHaveBeenCalledTimes(1);
    });

    it("Free sees the same lock on the page, no list and no box", () => {
        renderPage({
            ...STATE,
            available: false,
            reason: "locked",
            upgradeTo: "Grow",
            usage: null,
        });
        expect(text()).toContain("Ask AI comes with Grow");
        expect(host.querySelector("nav")).toBeNull();
        expect(host.querySelector("textarea")).toBeNull();
    });
});

const TABLE: AskAiInfoCard = {
    kind: "table",
    data: {
        title: "Unpaid bills",
        columns: ["Bill", "Customer"],
        rows: [["INV-1", "Asha"]],
        link: {
            label: "Open in Invoices",
            href: "/billing/invoices?view=unpaid",
        },
    },
};

describe("a saved conversation", () => {
    it("brings back the answer's cards, leaving out any it doesn't know", () => {
        const conversation = {
            id: "c1",
            agent: "ask-ai",
            title: "Who hasn't paid?",
            lastMessageAt: "2026-11-14T10:00:00Z",
            createdAt: "2026-11-14T10:00:00Z",
            messages: [
                {
                    id: "m1",
                    role: "USER",
                    outcome: null,
                    text: "Who hasn't paid?",
                    createdAt: "2026-11-14T10:00:00Z",
                },
                {
                    id: "m2",
                    role: "ASSISTANT",
                    outcome: "ANSWERED",
                    text: "Five bills are unpaid.",
                    cards: [TABLE, { kind: "chart", data: {} }],
                    createdAt: "2026-11-14T10:00:01Z",
                },
            ],
        } satisfies AskAiConversation;
        const [turn] = turnsOf(conversation);
        expect(turn.infoCards).toEqual([TABLE]);
        expect(turn.text).toBe("Five bills are unpaid.");
    });
});

describe("knows the page (AF 1–9)", () => {
    const KAVYA = customerPage(
        {
            id: "k1",
            name: "Kavya Menon",
            firstName: "Kavya",
            createdAt: "2026-06-03T10:00:00Z",
        },
        { zone: "Asia/Kolkata", visits: [] },
    );
    const sent = () => {
        const call = (fetchMock.mock.calls as [string, RequestInit][]).find(
            (c) => c[0] === "/api/ask-ai/turns",
        );
        return JSON.parse(
            (call?.[1].body as string | undefined) ?? "{}",
        ) as Record<string, unknown>;
    };

    it("names the page, and a hint asks it with the page", async () => {
        const s = feed();
        answerWith(s.body);
        act(() =>
            root.render(
                <>
                    <AskAiPageIs page={KAVYA} />
                    <AskAiPanel
                        state={STATE}
                        businessName="Kesar Salon"
                        zone="Asia/Kolkata"
                        phone={false}
                    />
                </>,
            ),
        );
        expect(text()).toContain("About: Kavya Menon");
        expect(host.querySelector("textarea")?.placeholder).toBe(
            "Ask about Kavya",
        );
        act(() => button("When did they last come?")?.click());
        await settle();
        expect(sent()).toEqual({
            question: "When did they last come?",
            about: { kind: "customer", id: "k1", label: "Kavya Menon" },
        });
        await s.end();
    });

    it("a pencil suggestion only fills the box", () => {
        act(() =>
            root.render(
                <>
                    <AskAiPageIs page={KAVYA} />
                    <AskAiPanel
                        state={STATE}
                        businessName="Kesar Salon"
                        zone="Asia/Kolkata"
                        phone={false}
                    />
                </>,
            ),
        );
        act(() => button("Book Kavya in…")?.click());
        expect(host.querySelector("textarea")?.value).toBe(
            "Book Kavya Menon in for ",
        );
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("clearing the label asks about the whole business, and it comes back", async () => {
        const s = feed();
        answerWith(s.body);
        act(() =>
            root.render(
                <>
                    <AskAiPageIs page={KAVYA} />
                    <AskAiPanel
                        state={STATE}
                        businessName="Kesar Salon"
                        zone="Asia/Kolkata"
                        phone={false}
                    />
                </>,
            ),
        );
        act(() => button("Ask about all of Kesar Salon instead")?.click());
        expect(text()).toContain("All of Kesar Salon");
        expect(text()).toContain("Ask about Kesar Salon");
        act(() => button("Ask about Kavya Menon again")?.click());
        expect(text()).toContain("About: Kavya Menon");
        act(() => button("Ask about all of Kesar Salon instead")?.click());
        await ask("How did the month go?");
        expect(sent()).toEqual({ question: "How did the month go?" });
        await s.end();
    });

    it("the clock lists conversations in the panel, each with where it began", async () => {
        actions.readAskAiConversations.mockResolvedValue({
            data: [
                {
                    id: "c1",
                    agent: "ask-ai",
                    title: "What do they usually order?",
                    about: { kind: "customer", label: "Kavya Menon" },
                    lastMessageAt: new Date().toISOString(),
                    createdAt: "",
                },
                {
                    id: "c2",
                    agent: "ask-ai",
                    title: "November vs October",
                    about: null,
                    lastMessageAt: new Date().toISOString(),
                    createdAt: "",
                },
            ],
            nextCursor: null,
        });
        render();
        act(() => button("Your conversations")?.click());
        await settle();
        expect(actions.readAskAiConversations).toHaveBeenCalled();
        expect(router.push).not.toHaveBeenCalled();
        expect(text()).toContain("Kavya Menon");
        expect(text()).toContain("All of Kesar Salon");
        expect(button("New conversation")).toBeDefined();
    });
});

describe("what a question used", () => {
    it("an answer the API counted never says it didn't use one", async () => {
        const s = feed();
        answerWith(s.body);
        render();
        await ask("Who is Asha?");
        await s.send({ type: "turn", turnId: "t1", conversationId: "c1" });
        await s.send({ type: "text-delta", text: "You can't see that." });
        await s.send({
            type: "done",
            turnId: "t1",
            outcome: "NO_ACCESS",
            counted: true,
            usage: { rounds: 1, inputTokens: 1, outputTokens: 1 },
        });
        await s.end();
        expect(text()).not.toContain("didn't use a question");
    });

    it("a dropped connection takes the saved answer, and never guesses", async () => {
        const s = feed();
        answerWith(s.body);
        actions.readAskAiConversation.mockResolvedValue({
            id: "c1",
            agent: "ask-ai",
            title: "x",
            lastMessageAt: "",
            createdAt: "",
            messages: [
                {
                    id: "m1",
                    role: "USER",
                    outcome: null,
                    text: "Bookings today?",
                    createdAt: "",
                },
                {
                    id: "m2",
                    role: "ASSISTANT",
                    outcome: "ANSWERED",
                    text: "Two today.",
                    createdAt: "",
                },
            ],
        });
        render();
        await ask("Bookings today?");
        await s.send({ type: "turn", turnId: "t1", conversationId: "c1" });
        await s.send({ type: "text-delta", text: "Two" });
        await s.end();
        expect(text()).toContain("Two today.");
        expect(text()).not.toContain("didn't use a question");
        expect(text()).toContain("Report this answer");
    });
});

describe("answers end in actions (AF 3, 4, 9)", () => {
    it("Book here drafts the booking under the answer, asking who", async () => {
        const s = feed();
        answerWith(s.body);
        actions.bookFromAnswer.mockResolvedValue({
            ok: true,
            data: {
                draftId: "d1",
                tool: "create_booking",
                kind: "booking",
                action: "create",
                status: "drafted",
                targetId: null,
                targetName: "Cake tasting",
                fields: [
                    {
                        field: "when",
                        label: "When",
                        old: null,
                        new: "Tue 17 Nov, 12:00 pm",
                    },
                ],
                missing: [{ field: "customer_id", label: "Who" }],
                refusal: null,
                note: null,
                expiresAt: "2099-01-01T00:00:00.000Z",
            },
        });
        render();
        await ask("When am I free?");
        await s.send({ type: "turn", turnId: "t1", conversationId: "c1" });
        await s.send({ type: "text-delta", text: "Tuesday." });
        await s.send({
            type: "card",
            kind: "slots",
            data: {
                title: "Cake tasting is free",
                serviceId: "s1",
                serviceName: "Cake tasting",
                days: [
                    {
                        label: "Tue 17 Nov",
                        range: "12:00 to 4:15 pm",
                        startsAt: "2026-11-17T12:00:00.000+05:30",
                    },
                ],
            },
        });
        await s.send({
            type: "next",
            items: [{ label: "Only after 5 pm", text: "Only after 5 pm" }],
        });
        await s.send({
            type: "done",
            turnId: "t1",
            outcome: "ANSWERED",
            counted: true,
            usage: { rounds: 1, inputTokens: 1, outputTokens: 1 },
        });
        await s.end();
        expect(text()).toContain("Your Calendar isn't marked with them.");

        act(() => button("Only after 5 pm")?.click());
        expect(host.querySelector("textarea")?.value).toBe("Only after 5 pm");

        act(() => button("Book Cake tasting here, Tue 17 Nov")?.click());
        await settle();
        expect(actions.bookFromAnswer).toHaveBeenCalledWith({
            conversationId: "c1",
            serviceId: "s1",
            startsAt: "2026-11-17T12:00:00.000+05:30",
        });
        expect(text()).toContain("New booking");
        expect(button("Book it")).toBeDefined();
    });

    it("the list says what each conversation did", async () => {
        actions.readAskAiConversations.mockResolvedValue({
            data: [
                {
                    id: "c1",
                    agent: "ask-ai",
                    title: "Which orders go out today?",
                    about: null,
                    done: "3 marked ready",
                    lastMessageAt: new Date().toISOString(),
                    createdAt: "",
                },
            ],
            nextCursor: null,
        });
        render();
        act(() => button("Your conversations")?.click());
        await settle();
        expect(text()).toContain("3 marked ready");
    });
});
