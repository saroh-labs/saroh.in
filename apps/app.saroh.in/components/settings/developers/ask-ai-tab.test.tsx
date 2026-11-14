// @vitest-environment jsdom
import type { AskAiState } from "@saroh/api-contract";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AskAiTab } from "./ask-ai-tab";

const saveAskAiOn = vi.fn();
vi.mock("@/lib/settings/ask-ai-actions", () => ({
    saveAskAiOn: (...args: unknown[]) => saveAskAiOn(...args) as unknown,
}));
vi.mock("@saroh/ui/toast", () => ({
    showError: vi.fn(),
    showSuccess: vi.fn(),
    showInfo: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));
const org = vi.fn();
vi.mock("@/lib/organizations/service", () => ({
    resolveActiveOrganization: () => org() as unknown,
}));
const state = vi.fn();
vi.mock("@/lib/ask-ai/service", () => ({
    getAskAiState: () => state() as unknown,
}));
vi.mock("./locked", () => ({
    DevelopersLocked: ({ name }: { name: string }) => <p>{name} is locked</p>,
}));

/**
 * Settings › Ask AI (plan 2026-11-13-001 U11): the Owner sees the switch,
 * this period's total and when it comes back; a Member is told who can.
 * Made-up business and counts.
 */

const RESETS = "2031-12-01T00:00:00.000Z";
const ownerState = (over: Partial<AskAiState> = {}): AskAiState => ({
    available: true,
    reason: null,
    upgradeTo: null,
    usage: { used: 12, limit: 50, resetsAt: RESETS },
    requestMore: true,
    ownerName: null,
    businessOn: true,
    canSwitch: true,
    language: "MATCH",
    ...over,
});

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    saveAskAiOn.mockReset();
    state.mockReset();
    state.mockResolvedValue(ownerState());
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

async function draw(actions: string[]) {
    org.mockResolvedValue({ name: "Example Salon", actions });
    const tree = await AskAiTab();
    act(() => root.render(tree));
}

describe("Settings › Ask AI", () => {
    it("shows the Owner the switch, the total and when it comes back", async () => {
        await draw(["module:manage"]);
        const text = host.textContent;
        expect(text).toContain("Ask AI for Example Salon");
        expect(text).toContain("12");
        expect(text).toContain("of 50 questions used");
        expect(text).toMatch(/Comes back \d{1,2} (Nov|Dec)/);
        expect(
            host.querySelector('[role="switch"]')?.getAttribute("aria-checked"),
        ).toBe("true");
    });

    it("says where questions go, and links to Roles", async () => {
        await draw(["module:manage"]);
        expect(host.textContent).toContain(
            "Questions and the business details needed to answer them are processed by Anthropic, outside India.",
        );
        expect(
            host.querySelector('a[href="/settings/people?tab=roles"]')
                ?.textContent,
        ).toBe("Change in Team › Roles");
    });

    it("turns Ask AI off with the switch", async () => {
        saveAskAiOn.mockResolvedValue({ ok: true, data: { on: false } });
        await draw(["module:manage"]);
        await act(async () => {
            host.querySelector<HTMLButtonElement>('[role="switch"]')?.click();
            await Promise.resolve();
        });
        expect(saveAskAiOn).toHaveBeenCalledWith(false);
    });

    it("doesn't open for a Member", async () => {
        await draw(["ai:use"]);
        expect(host.querySelector('[role="switch"]')).toBeNull();
        expect(host.textContent).not.toContain("questions used");
        expect(state).not.toHaveBeenCalled();
    });

    it("keeps the tab on a plan without Ask AI, and says so", async () => {
        state.mockResolvedValue(
            ownerState({ reason: "locked", upgradeTo: "Plan B", usage: null }),
        );
        await draw(["module:manage"]);
        expect(host.textContent).toContain("Ask AI is locked");
    });
});
