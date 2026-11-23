// @vitest-environment jsdom
/**
 * Ask AI's host (plan 2026-11-13-001 U10): the shared sheet, opened by the
 * top bar's event or ⌘J, the cursor in the box, Esc closing it with focus
 * back on the opener, and what was typed still there when it opens again.
 * The reply language is one select in the foot.
 */
import type { AskAiState } from "@saroh/api-contract";
import { act } from "react";
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
vi.mock("@/lib/customers/actions", () => ({
    findCustomers: vi.fn().mockResolvedValue({ ok: true, results: [] }),
    readCustomerAttention: vi.fn(),
}));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { AskAiHost } from "./ask-ai-host";
import { ASK_AI_SHOWN, OPEN_ASK_AI } from "./open";

const STATE: AskAiState = {
    available: true,
    reason: null,
    upgradeTo: null,
    usage: { used: 10, limit: 100, resetsAt: "2026-12-14T00:00:00.000Z" },
    requestMore: true,
    ownerName: null,
    businessOn: true,
    canSwitch: false,
    language: "MATCH",
};

let root: Root;
let host: HTMLDivElement;
let opener: HTMLButtonElement;
const dialog = () =>
    document.querySelector<HTMLElement>('[role="dialog"]') ?? null;

async function settle() {
    await act(async () => {
        for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
    });
}

function key(k: string, init: KeyboardEventInit = {}) {
    const target = document.activeElement ?? document.body;
    act(() => {
        target.dispatchEvent(
            new KeyboardEvent("keydown", { key: k, bubbles: true, ...init }),
        );
    });
}

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal(
        "matchMedia",
        (q: string) =>
            ({
                matches: q.includes("min-width"),
                media: q,
                addEventListener: () => undefined,
                removeEventListener: () => undefined,
            }) as unknown as MediaQueryList,
    );
    opener = document.createElement("button");
    opener.textContent = "Ask AI";
    document.body.appendChild(opener);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    vi.clearAllMocks();
    act(() =>
        root.render(
            <AskAiHost
                state={STATE}
                businessName="Kesar Salon"
                zone="Asia/Kolkata"
            />,
        ),
    );
});
afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
});

it("opens from the top bar's event as the shared sheet, the cursor in the box", async () => {
    const shown = vi.fn();
    window.addEventListener(ASK_AI_SHOWN, (e) => {
        shown((e as CustomEvent<boolean>).detail);
    });
    expect(dialog()).toBeNull();
    opener.focus();
    act(() => {
        window.dispatchEvent(new Event(OPEN_ASK_AI));
    });
    await settle();

    const sheet = dialog();
    expect(sheet).not.toBeNull();
    // Named by the sheet's title, never a hand-built dialog.
    const title = sheet?.getAttribute("aria-labelledby");
    expect(title && document.getElementById(title)?.textContent).toBe("Ask AI");
    expect(document.activeElement).toBe(sheet?.querySelector("textarea"));
    expect(shown).toHaveBeenLastCalledWith(true);
});

it("Esc closes it and gives focus back to the opener; what was typed stays", async () => {
    opener.focus();
    act(() => {
        window.dispatchEvent(new Event(OPEN_ASK_AI));
    });
    await settle();
    const box = dialog()?.querySelector("textarea");
    if (!box) throw new Error("no box");
    act(() => {
        Object.getOwnPropertyDescriptor(
            HTMLTextAreaElement.prototype,
            "value",
        )?.set?.call(box, "How many bookings?");
        box.dispatchEvent(new Event("input", { bubbles: true }));
    });

    key("Escape");
    await settle();
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(opener);

    act(() => {
        window.dispatchEvent(new Event(OPEN_ASK_AI));
    });
    await settle();
    expect(dialog()?.querySelector("textarea")?.value).toBe(
        "How many bookings?",
    );
});

it("⌘J opens and shuts it", async () => {
    opener.focus();
    key("j", { metaKey: true });
    await settle();
    expect(dialog()).not.toBeNull();
    key("j", { ctrlKey: true });
    await settle();
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(opener);
});

it("the header holds the menu and Close; the foot says nothing about the provider", async () => {
    act(() => {
        window.dispatchEvent(new Event(OPEN_ASK_AI));
    });
    await settle();
    const named = (name: string) =>
        dialog()?.querySelector<HTMLElement>(`button[aria-label="${name}"]`);
    // The reply language lives in ⋯, for everyone (board 17).
    expect(named("More, language and settings")).toBeTruthy();
    expect(dialog()?.querySelector('[role="combobox"]')).toBeNull();
    expect(dialog()?.textContent).not.toContain("Anthropic");
    act(() => named("Close Ask AI")?.click());
    await settle();
    expect(dialog()).toBeNull();
});
