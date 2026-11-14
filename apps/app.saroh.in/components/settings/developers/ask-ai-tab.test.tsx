// @vitest-environment jsdom
import type {
    AskAiPeopleUsage,
    AskAiSettings,
    AskAiState,
} from "@saroh/api-contract";
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
const settings = vi.fn();
const people = vi.fn();
vi.mock("@/lib/settings/ask-ai-usage", () => ({
    getAskAiSettingsWithUsage: () => settings() as unknown,
    getAskAiPeopleUsage: () => people() as unknown,
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

const ownerSettings = (over: Partial<AskAiSettings> = {}): AskAiSettings => ({
    on: true,
    usage: { used: 12, limit: 50, resetsAt: RESETS },
    ...over,
});

const person = (
    userId: string,
    over: Partial<AskAiPeopleUsage["people"][number]> = {},
) => ({
    userId,
    name: userId,
    role: "Member",
    givenAskAi: false,
    canUse: true,
    questions: 0,
    lastAskedAt: null,
    ...over,
});

const team: AskAiPeopleUsage = {
    periodStart: "2031-11-01T00:00:00.000Z",
    resetsAt: RESETS,
    people: [
        person("Neha Example", { canUse: false }),
        person("Dev Example", {
            givenAskAi: true,
            questions: 3,
            lastAskedAt: "2031-11-11T10:00:00.000Z",
        }),
        person("Asha Example", {
            role: "Owner",
            questions: 9,
            lastAskedAt: "2031-11-12T10:00:00.000Z",
        }),
    ],
};

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
    settings.mockReset();
    settings.mockResolvedValue(ownerSettings());
    people.mockReset();
    people.mockResolvedValue(team);
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

    it("keeps this month's total with Ask AI switched off", async () => {
        // The panel's state drops the total when the switch is off.
        state.mockResolvedValue(ownerState({ businessOn: false, usage: null }));
        settings.mockResolvedValue(
            ownerSettings({
                on: false,
                usage: { used: 7, limit: 50, resetsAt: RESETS },
            }),
        );
        await draw(["module:manage"]);
        expect(
            host.querySelector('[role="switch"]')?.getAttribute("aria-checked"),
        ).toBe("false");
        const card = host.querySelector('[aria-label="This month"]');
        expect(card?.textContent).toContain("7");
        expect(card?.textContent).toContain("of 50 questions used");
    });

    it("lists who asked, most first, with a dash for who can't use it", async () => {
        await draw(["module:manage"]);
        expect(host.textContent).toContain("Who asked this month");
        const rows = Array.from(host.querySelectorAll("[data-person]"));
        expect(rows.map((r) => r.getAttribute("data-person"))).toEqual([
            "Asha Example",
            "Dev Example",
            "Neha Example",
        ]);
        const cell = (i: number, name: string) =>
            rows[i]?.querySelector(`[data-${name}]`)?.textContent;
        expect(cell(0, "questions")).toBe("9");
        expect(rows[1]?.textContent).toContain("Member · given Ask AI");
        expect(cell(2, "questions")).toBe("—");
        expect(cell(2, "last-asked")).toBe("Can't use it");
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
        expect(people).not.toHaveBeenCalled();
    });

    it("keeps the tab on a plan without Ask AI, and says so", async () => {
        state.mockResolvedValue(
            ownerState({ reason: "locked", upgradeTo: "Plan B", usage: null }),
        );
        await draw(["module:manage"]);
        expect(host.textContent).toContain("Ask AI is locked");
    });
});
