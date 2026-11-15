// @vitest-environment jsdom
/**
 * AI assistants with nothing connected (release visibility U14, board
 * VASettingsEmpty): the address first, then the apps walked on dev.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/lib/ai-connections/actions", () => ({
    disconnectAiConnection: vi.fn(),
    readAiActivity: vi.fn(),
    rollBackAiSiteDraft: vi.fn(),
}));

import { CONNECT_IN } from "@/lib/ai-connections/mcp-address";
import { AiApps } from "./ai-apps";

const MCP = "https://mcp.saroh.in/mcp";
let root: Root;
let host: HTMLDivElement;
const writeText = vi.fn();

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    writeText.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
        value: { writeText },
        configurable: true,
    });
    act(() =>
        root.render(
            <AiApps
                connections={[]}
                business="Rye & Co."
                selfId="me"
                owner
                canEditSite
                mcp={MCP}
                docs="https://docs.example.in"
                zone="Asia/Kolkata"
            />,
        ),
    );
});

afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
});

const button = (name: string) => {
    const hit = Array.from(host.querySelectorAll("button")).find(
        (b) => b.textContent.trim() === name,
    );
    if (!hit) throw new Error(`No ${name} button`);
    return hit;
};
const press = (el: HTMLElement) =>
    act(async () => {
        el.click();
        await new Promise((r) => setTimeout(r, 0));
    });

describe("nothing connected", () => {
    it("puts the address first, and Copy says Copied politely", async () => {
        const steps = host.querySelectorAll("ol > li");
        expect(steps[0].textContent).toContain("Copy your Saroh address");
        expect(steps[1].textContent).toContain("Add it in your assistant");
        await press(button("Copy"));
        expect(writeText).toHaveBeenCalledWith(MCP);
        const said = host.querySelector("[aria-live=polite]");
        expect(said?.textContent).toBe("Copied");
    });

    it("selects the address and says to copy it when the clipboard is blocked", async () => {
        writeText.mockRejectedValue(new Error("blocked"));
        await press(button("Copy"));
        expect(host.querySelector("[role=alert]")?.textContent).toMatch(
            /Select it and copy it instead/,
        );
        const shown = host.querySelector<HTMLInputElement>(
            'input[aria-label="The address"]',
        );
        expect(shown?.value).toBe(MCP);
        expect([shown?.selectionStart, shown?.selectionEnd]).toEqual([
            0,
            MCP.length,
        ]);
    });

    it("offers only the apps walked on dev, each opening its own settings", () => {
        const apps = Array.from(host.querySelectorAll("[data-ai-app]")).map(
            (li) => li.getAttribute("data-ai-app"),
        );
        expect(apps).toEqual(["claude", "chatgpt"]);
        const link = (key: string) =>
            host.querySelector<HTMLAnchorElement>(`[data-ai-app=${key}] a`);
        expect(link("claude")?.href).toBe(CONNECT_IN.claude);
        expect(link("chatgpt")?.getAttribute("href")).toBe(CONNECT_IN.chatgpt);
        expect(link("claude")?.target).toBe("_blank");
        expect(host.querySelector("[data-ai-app=perplexity]")).toBeNull();
    });

    it("keeps what an assistant can and can't do", () => {
        expect(host.textContent).toContain("What an assistant can do here");
        expect(host.textContent).toContain("Cancel or refund anything");
    });
});
