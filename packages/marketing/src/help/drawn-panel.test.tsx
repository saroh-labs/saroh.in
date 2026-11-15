// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DrawnPanel } from "./drawn-panel";

afterEach(cleanup);

describe("DrawnPanel", () => {
    it("draws a form as text inside a captioned figure, no image", () => {
        const { container } = render(
            <DrawnPanel
                caption="A drawing of Claude's connector form"
                panel={{
                    kind: "form",
                    app: "Claude",
                    address: "claude.ai",
                    title: "Add a custom connector",
                    fields: [
                        { label: "Name", value: "Saroh" },
                        {
                            label: "Server URL",
                            value: "https://mcp.saroh.in/mcp",
                            mono: true,
                        },
                    ],
                    check: "I trust this app",
                    button: "Add",
                }}
            />,
        );
        const figure = screen.getByRole("figure");
        expect(figure.querySelector("figcaption")?.textContent).toBe(
            "A drawing of Claude's connector form",
        );
        expect(figure.textContent).toContain("Add a custom connector");
        expect(figure.textContent).toContain("https://mcp.saroh.in/mcp");
        expect(figure.textContent).toContain("I trust this app");
        expect(container.querySelector("img, [role=img]")).toBeNull();
    });

    it("draws a chat's ask, reply and rows as text", () => {
        render(
            <DrawnPanel
                caption="A drawing of a chat in ChatGPT"
                panel={{
                    kind: "chat",
                    app: "ChatGPT",
                    address: "chatgpt.com",
                    ask: "Change our Sunday hours",
                    rows: [{ label: "Sunday", value: "8:00 AM to 2:00 PM" }],
                    reply: "Done.",
                }}
            />,
        );
        const figure = screen.getByRole("figure");
        expect(figure.querySelector("figcaption")?.textContent).toBe(
            "A drawing of a chat in ChatGPT",
        );
        for (const words of [
            "Change our Sunday hours",
            "Done.",
            "8:00 AM to 2:00 PM",
        ]) {
            expect(figure.textContent).toContain(words);
        }
    });
});
