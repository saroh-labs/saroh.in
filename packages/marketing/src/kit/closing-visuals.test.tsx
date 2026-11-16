// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AskTypesWords } from "./ask-types";
import { AskTypes } from "./ask-types";
import type { ShareEverywhereWords } from "./share-everywhere";
import { ShareEverywhere } from "./share-everywhere";
import { TRADE_LOOKS } from "./trade-looks";

const post = (label: string, title: string) => ({
    label,
    kind: "New",
    title,
    sub: "₹360 · box of 6",
    line: "₹360",
    caption: `${title}, fresh`,
    reply: "Saving two.",
    path: `/shop/${title.toLowerCase().replace(/\W+/g, "-")}`,
    photo: "buns" as const,
});
const SHARE: ShareEverywhereWords = {
    lede: "Press Share on anything with a page.",
    pick: "What to share",
    row: "The same post in each app",
    apps: {
        whatsapp: "WhatsApp · a chat",
        instagram: "Instagram · a square post",
        facebook: "Facebook · a link post",
    },
    handle: "ryeandco",
    of: "of",
    posts: [
        post("A product", "Cardamom bun box"),
        post("A class", "Sourdough basics"),
        post("An offer", "Weekend bakes"),
    ],
};
const BIZ = {
    name: "Rye & Co.",
    site: "rye-and-co.saroh.app",
    look: TRADE_LOOKS.bakery,
};
const ASK: AskTypesWords = {
    pick: "Ask one",
    readFrom: "Read from",
    questions: [
        {
            label: "What sold most?",
            text: "What sold most this week?",
            answer: "Cardamom bun box: 46 sold this week.",
            from: "Orders, Products",
        },
        {
            label: "Who hasn't paid?",
            text: "Who still owes me money?",
            answer: "Anjali Shah has a pay link.",
            from: "Orders, Billing",
        },
    ],
};

/** A controllable IntersectionObserver: `show(ratio)` reports the band. */
let show: (ratio: number) => void = () => undefined;
const motion = (reduce: boolean) =>
    vi.stubGlobal("matchMedia", () => ({ matches: reduce }));

beforeEach(() => {
    motion(false);
    vi.stubGlobal(
        "IntersectionObserver",
        class {
            constructor(cb: (e: { intersectionRatio: number }[]) => void) {
                show = (r) => act(() => cb([{ intersectionRatio: r }]));
            }
            observe = vi.fn();
            disconnect = vi.fn();
        },
    );
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

const shareTitle = (c: HTMLElement) => c.querySelector("b")?.textContent;
const question = (c: HTMLElement) =>
    c.querySelector("[data-question]")?.textContent;

describe("ShareEverywhere, Share's closing (#46 U)", () => {
    it("server-renders the first item's three posts", () => {
        const html = renderToString(
            <ShareEverywhere words={SHARE} business={BIZ} />,
        );
        expect(html).toContain("Cardamom bun box");
        expect(html).toContain("rye-and-co.saroh.app/shop/cardamom-bun-box");
        expect(html).toContain("WhatsApp · a chat");
        expect(html).toContain("Instagram · a square post");
        expect(html).toContain("Facebook · a link post");
        expect(html).not.toContain("Sourdough basics");
    });

    it("moves on only once the band is in view", () => {
        vi.useFakeTimers();
        const { container } = render(
            <ShareEverywhere words={SHARE} business={BIZ} />,
        );
        act(() => void vi.advanceTimersByTime(7000));
        expect(shareTitle(container)).toBe("Cardamom bun box");
        show(0.2);
        act(() => void vi.advanceTimersByTime(7000));
        expect(shareTitle(container)).toBe("Cardamom bun box");
        show(0.5);
        act(() => void vi.advanceTimersByTime(3200));
        expect(shareTitle(container)).toBe("Sourdough basics");
    });

    it("a picked chip shows its post and stops the autoplay", () => {
        vi.useFakeTimers();
        const { container } = render(
            <ShareEverywhere words={SHARE} business={BIZ} />,
        );
        show(1);
        const offer = screen.getByRole("button", { name: "An offer" });
        fireEvent.click(offer);
        expect(offer.getAttribute("aria-pressed")).toBe("true");
        expect(shareTitle(container)).toBe("Weekend bakes");
        act(() => void vi.advanceTimersByTime(20000));
        expect(shareTitle(container)).toBe("Weekend bakes");
    });

    it("under reduced motion never moves", () => {
        vi.useFakeTimers();
        motion(true);
        const { container } = render(
            <ShareEverywhere words={SHARE} business={BIZ} />,
        );
        show(1);
        act(() => void vi.advanceTimersByTime(20000));
        expect(shareTitle(container)).toBe("Cardamom bun box");
        expect(vi.getTimerCount()).toBe(0);
    });
});

describe("AskTypes, Ask AI's closing (#46 N)", () => {
    it("server-renders the first question answered, with no caret", () => {
        const html = renderToString(<AskTypes words={ASK} />);
        expect(html).toContain("What sold most this week?");
        expect(html).toContain("Cardamom bun box: 46 sold this week.");
        expect(html).toContain("Read from");
        expect(html).not.toContain("mk-caret");
    });

    it("types the next question once in view, then answers it", () => {
        vi.useFakeTimers();
        const { container } = render(<AskTypes words={ASK} />);
        act(() => void vi.advanceTimersByTime(10000));
        expect(question(container)).toBe("What sold most this week?");
        show(0.5);
        // The hold, then a few letters of the next question.
        act(() => void vi.advanceTimersByTime(60 * 60));
        expect(question(container)).not.toBe("What sold most this week?");
        expect(container.innerHTML).toContain("mk-caret");
        act(() => void vi.advanceTimersByTime(60 * 30));
        expect(question(container)).toBe("Who still owes me money?");
    });

    it("a picked chip answers it whole and stops the autoplay", () => {
        vi.useFakeTimers();
        const { container } = render(<AskTypes words={ASK} />);
        show(1);
        fireEvent.click(
            screen.getByRole("button", { name: "Who hasn't paid?" }),
        );
        expect(question(container)).toBe("Who still owes me money?");
        expect(container.textContent).toContain("Anjali Shah has a pay link.");
        act(() => void vi.advanceTimersByTime(20000));
        expect(question(container)).toBe("Who still owes me money?");
        expect(container.innerHTML).not.toContain("mk-caret");
    });

    it("under reduced motion stays on the first question, with no timer", () => {
        vi.useFakeTimers();
        motion(true);
        const { container } = render(<AskTypes words={ASK} />);
        show(1);
        act(() => void vi.advanceTimersByTime(20000));
        expect(question(container)).toBe("What sold most this week?");
        expect(container.innerHTML).not.toContain("mk-caret");
        expect(vi.getTimerCount()).toBe(0);
    });
});
