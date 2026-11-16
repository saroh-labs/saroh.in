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

import { advance } from "../../sections/steps-player";
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
        pause: "Pause",
        play: "Play it through",
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

/** Motion allowed (or not); no IntersectionObserver in jsdom, so it counts as on screen. */
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

describe("AskSteps (board overdrive)", () => {
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
        // No autoplay button without script.
        expect(html).not.toContain("Play it through");
    });

    it("keeps the finished story and runs no timer with reduced motion", () => {
        motion(true);
        vi.useFakeTimers();
        render(ui());
        expect(pressed()).toEqual(["false", "false", "false", "true"]);
        expect(vi.getTimerCount()).toBe(0);
        expect(status("ORD-1")).toBe("Ready");
        expect(screen.queryByRole("button", { name: "Pause" })).toBeNull();
    });

    it("plays from step 1; picking a step stops it; confirming marks the rows Ready", async () => {
        motion(false);
        vi.useFakeTimers();
        render(ui());
        // Restarted on the client: step 1, the ready questions, playing.
        expect(pressed()).toEqual(["true", "false", "false", "false"]);
        expect(screen.getByText("Mark today's orders ready…")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(80 * 26);
        });
        expect(pressed()[1]).toBe("true");

        fireEvent.click(screen.getByRole("button", { name: /Confirm/ }));
        expect(pressed()).toEqual(["false", "false", "false", "true"]);
        expect(
            screen.getByRole("button", { name: "Play it through" }),
        ).toBeTruthy();
        expect(vi.getTimerCount()).toBe(0);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(80 * 200);
        });
        expect(pressed()[3]).toBe("true");
        expect(status("ORD-1")).toBe("Paid");

        fireEvent.click(screen.getByRole("button", { name: "Mark 2 ready" }));
        expect(status("ORD-1")).toBe("Ready");
        expect(status("ORD-3")).toBe("Ready");
        expect(status("ORD-2")).toBe("Not paid");
        expect(screen.getByText("Undo")).toBeTruthy();
    });
});

describe("StepsPlayer's advance", () => {
    it("runs a step, confirms the last, then goes round to step 1", () => {
        const s = { at: 3, tick: 2, auto: true, confirmed: false };
        expect(advance(s, [2, 2, 2, 2])).toEqual({
            ...s,
            confirmed: true,
            tick: 0,
        });
        expect(advance({ ...s, confirmed: true }, [2, 2, 2, 2])).toEqual({
            at: 0,
            tick: 0,
            auto: true,
            confirmed: false,
        });
        expect(advance({ ...s, at: 1, tick: 2 }, [2, 2, 2, 2]).at).toBe(2);
    });
});
