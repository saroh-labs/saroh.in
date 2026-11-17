// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConnectSteps } from "./connect-steps";

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

const PROPS = {
    id: "in-the-app",
    title: "Connected in a minute. In charge after.",
    lede: "Paste one address into your AI app.",
    address: "https://mcp.saroh.in/mcp",
    steps: [
        { title: "Add a connector", body: "In Claude or ChatGPT." },
        { title: "Sign in and allow", body: "Tick the businesses." },
        { title: "Ask", body: "It drafts, you publish." },
    ],
    guides: [
        {
            href: "/help/connect-claude",
            label: "Claude",
            icon: "/logos/claude.svg",
        },
        {
            href: "/help/connect-chatgpt",
            label: "ChatGPT",
            icon: "/logos/openai.svg",
        },
        { href: "/help/connect-other-ai-apps", label: "Another AI app" },
    ],
    words: {
        copy: "Copy",
        copied: "Copied",
        failed: "Couldn't copy. The address is selected.",
        guides: "Step-by-step for",
    },
};

describe("ConnectSteps (AI apps, variant I)", () => {
    it("shows the address without https://, the steps in order and each guide", () => {
        render(<ConnectSteps {...PROPS} />);
        const section = screen
            .getByRole("heading", { level: 2, name: PROPS.title })
            .closest("section");
        expect(section?.id).toBe("in-the-app");
        expect(section?.querySelector("code")?.textContent).toBe(
            "mcp.saroh.in/mcp",
        );
        expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
        expect(
            within(screen.getByRole("list")).getAllByRole("heading", {
                level: 3,
            }),
        ).toHaveLength(3);
        const claude = screen.getByRole("link", { name: "Claude" });
        expect(claude.getAttribute("href")).toBe("/help/connect-claude");
        // The mark is decoration: the label names the app.
        expect(claude.querySelector("img")?.getAttribute("alt")).toBe("");
        expect(
            screen
                .getByRole("link", { name: "ChatGPT" })
                .querySelector("img")
                ?.getAttribute("src"),
        ).toBe("/logos/openai.svg");
        expect(
            screen
                .getByRole("link", { name: "Another AI app" })
                .querySelector("img"),
        ).toBeNull();
    });

    it("copies the whole URL and says Copied out loud", async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        vi.stubGlobal("navigator", { clipboard: { writeText } });
        render(<ConnectSteps {...PROPS} />);
        await act(async () => {
            screen.getByRole("button", { name: "Copy" }).click();
            await Promise.resolve();
        });
        expect(writeText).toHaveBeenCalledWith("https://mcp.saroh.in/mcp");
        expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
        expect(document.querySelector("[aria-live]")?.textContent).toBe(
            "Copied",
        );
    });

    it("where the clipboard is refused, says so and keeps the button", async () => {
        vi.stubGlobal("navigator", {});
        render(<ConnectSteps {...PROPS} />);
        await act(async () => {
            screen.getByRole("button", { name: "Copy" }).click();
            await Promise.resolve();
        });
        expect(document.querySelector("[aria-live]")?.textContent).toBe(
            PROPS.words.failed,
        );
        expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
    });

    it("draws no guide row when there are no guides", () => {
        render(<ConnectSteps {...PROPS} guides={[]} />);
        expect(screen.queryByText("Step-by-step for")).toBeNull();
    });
});
