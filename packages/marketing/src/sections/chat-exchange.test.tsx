// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AppList } from "./app-list";
import { ChatExchange, OUTCOME_PILL } from "./chat-exchange";

afterEach(cleanup);

const WORDS = {
    caption: "Drawing of a chat in Claude",
    ask: "Move Ritu's facial to Saturday.",
    tools: "Saroh · move_booking",
    reply: "Moved.",
    outcome: "at_once",
    result: { title: "Hydrating facial", line: "Saturday, 11:00 AM" },
} as const;

describe("ChatExchange", () => {
    it("draws the ask, reply, record and outcome as text in a captioned figure", () => {
        const { container } = render(<ChatExchange words={WORDS} />);
        const figure = screen.getByRole("figure");
        expect(figure.querySelector("figcaption")?.textContent).toBe(
            "Drawing of a chat in Claude",
        );
        expect(container.querySelector("img")).toBeNull();
        for (const text of [
            WORDS.ask,
            WORDS.tools,
            WORDS.reply,
            WORDS.result.title,
            WORDS.result.line,
            "Changed at once",
        ]) {
            expect(figure.textContent).toContain(text);
        }
    });

    it("says each outcome in words, as the trade pages do", () => {
        expect(
            Object.fromEntries(
                Object.entries(OUTCOME_PILL).map(([k, v]) => [k, v.text]),
            ),
        ).toEqual({
            at_once: "Changed at once",
            draft: "Draft to publish",
            answer: "Just an answer",
        });
        render(
            <ChatExchange
                words={{ ...WORDS, outcome: "draft", result: undefined }}
            />,
        );
        expect(screen.getByText("Draft to publish")).toBeTruthy();
    });
});

describe("AppList", () => {
    const words = {
        title: "Apps you can use",
        lead: "A lead",
        also: "Also works with Notion.",
    };

    it("draws a card per app given, then the one line", () => {
        render(
            <AppList
                words={words}
                apps={[
                    {
                        href: "/integrations/claude",
                        name: "Claude",
                        kind: "AI assistant",
                        line: "Ask Claude.",
                        cta: "See Claude",
                    },
                ]}
            />,
        );
        const section = screen
            .getByRole("heading", { level: 2, name: "Apps you can use" })
            .closest("section");
        expect(section?.querySelectorAll("li")).toHaveLength(1);
        expect(
            screen
                .getByRole("link", { name: /See Claude/ })
                .getAttribute("href"),
        ).toBe("/integrations/claude");
        expect(screen.getByText("Also works with Notion.")).toBeTruthy();
    });

    it("with no live app, keeps the line and draws no empty list", () => {
        const { container } = render(<AppList words={words} apps={[]} />);
        expect(container.querySelector("ul")).toBeNull();
        expect(screen.getByText("Also works with Notion.")).toBeTruthy();
    });
});
