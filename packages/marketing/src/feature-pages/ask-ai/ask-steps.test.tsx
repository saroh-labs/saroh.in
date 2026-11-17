// @vitest-environment jsdom
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BEAT } from "../../sections/steps-player";
import type { AskPlayWords } from "./answer";
import { AskSteps } from "./ask-steps";

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

const words: AskPlayWords = {
    panel: {
        label: "The Ask AI panel answering a question about today's orders",
        title: "Ask AI",
        about: "All of Rye & Co.",
        q: "Is everything ready for today's orders?",
        checked: "Checked just now",
        lead: "3 orders are due for pick-up today.",
        why: "2 are paid.",
        head: ["Order", "Customer", "Total", "Paid"],
        rows: [
            {
                id: "ORD-1",
                customer: "Asha",
                total: "10",
                paid: "Paid",
                from: false,
            },
            {
                id: "ORD-2",
                customer: "Meera",
                total: "20",
                paid: "Not paid",
                from: true,
            },
            {
                id: "ORD-3",
                customer: "Priya",
                total: "30",
                paid: "Paid",
                from: false,
            },
        ],
        stockHead: ["For these orders", "Needed", "In stock"],
        stockRows: [],
        from: "Read from",
        sources: ["Orders", "Customers"],
        where: "· today",
        card: {
            head: "Change 2 orders",
            title: "Mark as ready for pick-up",
            kv: [
                ["Orders", "ORD-1, ORD-3"],
                ["Then", "They show as Ready in Orders"],
            ],
            orders: ["ORD-1", "ORD-3"],
            note: "Undo works all day.",
            buttons: ["Mark 2 ready", "Pick which"],
        },
        more: "See the whole answer",
    },
    home: {
        lead: "Ask about Rye & Co.",
        sugs: [
            { t: "November vs October", h: "Up so far" },
            { t: "Mark today's orders ready…", h: "3 due", act: true },
        ],
    },
    hint: "Hints are counted from your business.",
    play: {
        startOver: "Start over",
        reading: "Reading",
        ready: "Ready",
        done: "Done",
        undo: "Undo",
    },
};

const how = {
    id: "in-the-app",
    title: "Ask in your own words.",
    lede: "A lede",
    steps: ["Open", "Ask", "Answer", "Confirm"].map((title) => ({
        title,
        body: `${title} body`,
        who: "Rye & Co. (demo bakery)",
        shot: "ask-start" as const,
    })),
    foot: "History keeps your conversations for 90 days.",
    links: [],
};

const ui = () => <AskSteps how={how} words={words} stockOn={false} />;

/** Motion allowed, or reduced. */
function motion(reduce: boolean) {
    vi.stubGlobal("matchMedia", (q: string) => ({
        matches: reduce && q.includes("reduce"),
        media: q,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    }));
}

const pressed = () =>
    screen
        .getAllByRole("button", { name: /^Step/ })
        .map((b) => b.getAttribute("aria-pressed"));
const status = (id: string) =>
    screen.getByText(id).parentElement?.lastElementChild?.textContent;
const hint = () =>
    screen.getByRole("button", { name: /Mark today's orders ready/ });

describe("AskSteps (board overdrive, hands-on)", () => {
    it("draws the whole conversation in the server HTML, confirmed", () => {
        const html = renderToStaticMarkup(ui());
        const box = document.createElement("div");
        box.innerHTML = html;
        const text = box.textContent;
        for (const said of [
            words.panel.q,
            words.panel.lead,
            words.panel.why,
            "Meera",
            "Mark as ready for pick-up",
            "Undo",
            "90 days",
            "Rye & Co. (demo bakery)",
        ])
            expect(text).toContain(said);
        expect(html.match(/>Ready</g)).toHaveLength(2);
        expect(
            box.querySelector('[role="region"]')?.getAttribute("aria-label"),
        ).toBe(words.panel.label);
        expect(text).not.toContain("Start over");
    });

    it("starts still at step 1 and moves only when the visitor acts", async () => {
        motion(false);
        vi.useFakeTimers();
        render(ui());
        expect(pressed()).toEqual(["true", "false", "false", "false"]);
        // Nothing plays by itself.
        expect(vi.getTimerCount()).toBe(0);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(10_000);
        });
        expect(pressed()[0]).toBe("true");
        expect(screen.queryByText("Start over")).toBeNull();

        // Tapping the hint asks it: a short Reading beat, then the answer.
        fireEvent.click(hint());
        expect(pressed()[1]).toBe("true");
        expect(screen.getByText("Reading")).toBeTruthy();
        expect(screen.queryByText(words.panel.lead)).toBeNull();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(BEAT);
        });
        expect(pressed()[2]).toBe("true");
        expect(screen.getByText(words.panel.lead)).toBeTruthy();
        expect(status("ORD-1")).toBe("Paid");

        // Confirming marks the card's orders Ready and ends on step 4.
        fireEvent.click(screen.getByRole("button", { name: "Mark 2 ready" }));
        expect(pressed()[3]).toBe("true");
        expect(status("ORD-1")).toBe("Ready");
        expect(status("ORD-3")).toBe("Ready");
        expect(status("ORD-2")).toBe("Not paid");

        // Start over goes back to the ready questions.
        fireEvent.click(screen.getByRole("button", { name: "Start over" }));
        expect(pressed()[0]).toBe("true");
        expect(hint()).toBeTruthy();
    });

    it("jumps to a picked step", () => {
        motion(false);
        render(ui());
        fireEvent.click(screen.getByRole("button", { name: /Confirm/ }));
        expect(pressed()).toEqual(["false", "false", "false", "true"]);
        expect(
            screen.getByRole("button", { name: "Mark 2 ready" }),
        ).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: /Ask body/ }));
        expect(pressed()[1]).toBe("true");
        expect(screen.getByText("Reading")).toBeTruthy();
    });

    it("skips the beat with reduced motion: the answer comes at once", () => {
        motion(true);
        vi.useFakeTimers();
        render(ui());
        expect(pressed()[0]).toBe("true");
        fireEvent.click(hint());
        expect(vi.getTimerCount()).toBe(0);
        expect(pressed()[2]).toBe("true");
        expect(screen.getByText(words.panel.lead)).toBeTruthy();
    });
});
