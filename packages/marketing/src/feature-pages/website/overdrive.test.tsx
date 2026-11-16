// @vitest-environment jsdom
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TRADE_LOOKS } from "../../kit/trade-looks";
import { BrandStudio, LOOK_MS } from "./brand-studio";
import { Journey, STAGE_MS } from "./journey";
import type { ShopSiteWords } from "./shop-site";
import type { JourneyStage, WebsiteWords } from "./words";

const site: ShopSiteWords = {
    name: "Rye & Co.",
    address: "rye-and-co.saroh.app",
    nav: ["Home"],
    order: "Order",
    headline: "Baked this morning",
    line: "Breads and buns.",
    ctas: ["Order"],
    open: "Open now",
    shopTitle: "This week",
    seeShop: "See the shop",
    products: [{ key: "buns", name: "Bun box", price: "380" }],
    classTitle: "Sourdough basics",
    classLine: "Saturday",
    slot: "Sat 10 am",
    classShort: "Sourdough · Sat",
    leftShort: "2 left",
    book: "Book",
    foot: [],
    pins: { products: "Products", bookings: "Bookings", hours: "Hours" },
};

const stage = (
    title: string,
    extra: Partial<JourneyStage> = {},
): JourneyStage => ({
    title,
    sub: `${title} sub`,
    heading: `${title} heading`,
    body: `${title} body`,
    host: `${title.toLowerCase()}.host`,
    badge: `${title} badge`,
    tone: "ok",
    ...extra,
});

const journey: WebsiteWords["journey"] = {
    title: "Nothing goes live until it's right.",
    lead: "Lead",
    label: "The page",
    track: "From draft to live",
    startOver: "Start over",
    draft: stage("Draft", {
        tone: "draft",
        stamp: "DRAFT · ONLY YOU",
        actions: [{ label: "Make a test release", result: "Live now" }],
    }),
    release: [
        stage("Test", {
            tone: "test",
            actions: [{ label: "Approve it", result: "Live now" }],
        }),
        stage("Approved", {
            chip: "Ravi approved",
            actions: [
                { label: "Go live now", result: "Live now" },
                { label: "Sat, 9:00 am", result: "Goes live Sat, 9:00 am" },
            ],
        }),
    ],
    live: stage("Live"),
    publish: {
        action: { label: "Publish", result: "Live now" },
        live: stage("Live"),
    },
};
const stages = [journey.draft, ...journey.release, journey.live];

const studio: WebsiteWords["studio"] = {
    title: "Your brand, every screen.",
    lead: "Lead",
    label: "Rye's website",
    colours: "Colours",
    screen: "Screen",
    devices: ["Desktop", "Tablet", "Phone"],
    note: "Note",
};
const options = [
    { label: "Cream and terracotta", look: TRADE_LOOKS.bakery },
    { label: "Plum and gold", look: TRADE_LOOKS.salon },
    { label: "Black and lime", look: TRADE_LOOKS.gym },
    { label: "Blush and wine", look: TRADE_LOOKS.florist },
].map((o) => ({ ...o, line: "" }));

/** A stand-in IntersectionObserver the test scrolls by hand. */
let shown: ((ratio: number) => void)[] = [];
function observer() {
    shown = [];
    vi.stubGlobal(
        "IntersectionObserver",
        class {
            constructor(cb: IntersectionObserverCallback) {
                shown.push((ratio) =>
                    cb(
                        [
                            {
                                intersectionRatio: ratio,
                            } as IntersectionObserverEntry,
                        ],
                        this as unknown as IntersectionObserver,
                    ),
                );
            }
            observe = vi.fn();
            disconnect = vi.fn();
        },
    );
}
function motion(reduce: boolean) {
    vi.stubGlobal("matchMedia", (q: string) => ({
        matches: reduce && q.includes("reduce"),
        media: q,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    }));
}
const scrollIn = () => {
    act(() => shown.forEach((f) => f(0.6)));
};
const wait = (ms: number) => {
    act(() => {
        vi.advanceTimersByTime(ms);
    });
};
const frame = () => screen.getByRole("figure", { name: /The page|Rye's/ });

beforeEach(() => {
    vi.useFakeTimers();
    observer();
    motion(false);
});
afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

const journeyUi = () => (
    <Journey words={journey} stages={stages} site={site} shop />
);

describe("Journey: nothing goes live until it's right", () => {
    it("holds every stage's words and the Live frame in the server's HTML", () => {
        const html = renderToStaticMarkup(journeyUi());
        for (const s of stages) {
            expect(html).toContain(s.title);
            expect(html).toContain(s.heading);
            expect(html).toContain(s.body);
        }
        expect(html).toContain('data-stage="Live"');
        expect(html).toContain("live.host");
        expect(html).not.toContain("DRAFT · ONLY YOU");
    });

    it("plays only once it is in view, a stage at a time, and loops", () => {
        render(journeyUi());
        expect(frame().dataset.stage).toBe("Draft");
        wait(STAGE_MS * 3);
        expect(frame().dataset.stage).toBe("Draft");
        scrollIn();
        wait(STAGE_MS);
        expect(frame().dataset.stage).toBe("Test");
        wait(STAGE_MS * 3);
        expect(frame().dataset.stage).toBe("Draft");
        act(() => {
            shown.forEach((f) => f(0.1));
        });
        wait(STAGE_MS * 2);
        expect(frame().dataset.stage).toBe("Draft");
    });

    it("draws each stage's address, stamp and chip", () => {
        render(journeyUi());
        expect(screen.getByText("DRAFT · ONLY YOU")).toBeTruthy();
        expect(screen.getByText("draft.host")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: /Approved/ }));
        expect(screen.getByText("Ravi approved")).toBeTruthy();
        expect(screen.queryByText("DRAFT · ONLY YOU")).toBeNull();
    });

    it("moves on a pick or an action, and stops playing for good", () => {
        render(journeyUi());
        scrollIn();
        fireEvent.click(
            screen.getByRole("button", { name: "Make a test release" }),
        );
        expect(frame().dataset.stage).toBe("Test");
        wait(STAGE_MS * 5);
        expect(frame().dataset.stage).toBe("Test");
        fireEvent.click(screen.getByRole("button", { name: /Approved/ }));
        fireEvent.click(screen.getByRole("button", { name: "Sat, 9:00 am" }));
        expect(frame().dataset.stage).toBe("Live");
        expect(screen.getByText("Goes live Sat, 9:00 am")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Start over" }));
        expect(frame().dataset.stage).toBe("Draft");
        wait(STAGE_MS * 3);
        expect(frame().dataset.stage).toBe("Draft");
    });

    it("stays on Live, still, under reduced motion", () => {
        motion(true);
        render(journeyUi());
        scrollIn();
        expect(vi.getTimerCount()).toBe(0);
        expect(frame().dataset.stage).toBe("Live");
        expect(
            document.querySelector(".motion-safe\\:animate-ping"),
        ).toBeTruthy();
    });
});

const studioUi = () => (
    <BrandStudio words={studio} options={options} site={site} shop />
);
const look = () => frame().dataset.look;
const scr = () => frame().dataset.screen;

describe("BrandStudio: your brand, every screen", () => {
    it("draws the first colour set on Desktop on the server", () => {
        const html = renderToStaticMarkup(studioUi());
        expect(html).toContain('data-look="Cream and terracotta"');
        expect(html).toContain('data-screen="Desktop"');
        for (const o of options) expect(html).toContain(o.label);
    });

    it("plays every colour set, then the next screen, once in view", () => {
        render(studioUi());
        wait(LOOK_MS * 2);
        expect(look()).toBe("Cream and terracotta");
        scrollIn();
        wait(LOOK_MS);
        expect(look()).toBe("Plum and gold");
        wait(LOOK_MS * 3);
        expect(look()).toBe("Cream and terracotta");
        expect(scr()).toBe("Tablet");
    });

    it("a pick changes the frame and stops playing for good", () => {
        render(studioUi());
        scrollIn();
        fireEvent.click(screen.getByRole("button", { name: /Black and lime/ }));
        fireEvent.click(screen.getByRole("button", { name: "Phone" }));
        expect(look()).toBe("Black and lime");
        expect(scr()).toBe("Phone");
        expect(frame().className).toContain("max-w-[290px]");
        wait(LOOK_MS * 6);
        expect(look()).toBe("Black and lime");
    });

    it("never plays under reduced motion", () => {
        motion(true);
        render(studioUi());
        scrollIn();
        expect(vi.getTimerCount()).toBe(0);
        expect(look()).toBe("Cream and terracotta");
    });
});
