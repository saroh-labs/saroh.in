// @vitest-environment jsdom
/**
 * Ask AI's state and actions (DEC-183), without the panel: the reply
 * language changes at once and comes back if the API refuses it, and a
 * new conversation starts empty.
 */
import type { AskAiState } from "@saroh/api-contract";
import { act, useEffect } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
    readAskAiState: vi.fn(),
    readAskAiConversation: vi.fn(),
    readAskAiConversations: vi.fn(),
    changeAskAiLanguage: vi.fn(),
    turnOnAskAi: vi.fn(),
    bookFromAnswer: vi.fn(),
}));
vi.mock("@/lib/ask-ai/panel-actions", () => actions);
// Images in the box upload through the media actions: not here.
vi.mock("@/lib/media/actions", () => ({
    createUpload: vi.fn(),
    completeUpload: vi.fn(),
    listLibrary: vi.fn().mockResolvedValue([]),
}));
const turns = vi.hoisted(() => ({
    startAskAiTurn: vi.fn(),
    stopAskAiTurn: vi.fn(),
}));
vi.mock("@/lib/ask-ai/turn-requests", () => turns);
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/components/billing/plan-refusal", () => ({
    reportFailure: vi.fn(),
}));

import type { AskAi } from "./use-ask-ai";
import { useAskAi } from "./use-ask-ai";

const STATE: AskAiState = {
    available: true,
    reason: null,
    upgradeTo: null,
    usage: null,
    requestMore: true,
    ownerName: null,
    businessOn: true,
    canSwitch: true,
    language: "MATCH",
};

let root: Root;
let ai: AskAi;
function Probe({ state }: { state: AskAiState }) {
    const hook = useAskAi({ state });
    useEffect(() => {
        ai = hook;
    });
    return null;
}

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    root = createRoot(document.createElement("div"));
    act(() => root.render(<Probe state={STATE} />));
});
afterEach(() => {
    act(() => root.unmount());
});

it("changes the reply language at once and keeps it when saved", async () => {
    actions.changeAskAiLanguage.mockResolvedValue({ ok: true, data: {} });
    await act(async () => {
        await ai.setLanguage("HINGLISH");
    });
    expect(actions.changeAskAiLanguage).toHaveBeenCalledWith("HINGLISH");
    expect(ai.state?.language).toBe("HINGLISH");
});

it("puts the language back when the API refuses it", async () => {
    actions.changeAskAiLanguage.mockResolvedValue({
        ok: false,
        error: "No",
    });
    await act(async () => {
        await ai.setLanguage("HINDI");
    });
    expect(ai.state?.language).toBe("MATCH");
});

it("a new conversation starts empty, on the thread", () => {
    act(() => {
        ai.setDraft("half typed");
        ai.setView("history");
    });
    act(() => ai.startNew());
    expect(ai.draft).toBe("");
    expect(ai.view).toBe("thread");
    expect(ai.conversationId).toBeNull();
    expect(ai.turns).toEqual([]);
});

it("Ask again sends the question's images again, by their ids, without uploading", async () => {
    turns.startAskAiTurn.mockResolvedValue(null);
    actions.readAskAiState.mockResolvedValue(null);
    await act(async () => {
        await ai.ask("Alt text", false, [
            { mediaId: "m1", url: "https://m.test/1.png", filename: "1.png" },
            { mediaId: "m2", url: "https://m.test/2.png", filename: "2.png" },
        ]);
    });
    expect(turns.startAskAiTurn).toHaveBeenCalledWith(
        expect.objectContaining({ question: "Alt text", images: ["m1", "m2"] }),
    );
    expect(ai.turns[0]?.images).toHaveLength(2);
});
