// Renders each page in the code: what both apps draw (dev-only check that the template still renders every page).
import {
    cleanup,
    fireEvent,
    render,
    screen,
    within,
} from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { ForHub } from "./components/for-hub";
import { SearchPage } from "./components/search-page";
import { allSearchPages, listSearchPages, loadSearchPage } from "./embedded";

beforeAll(() => {
    Element.prototype.scrollTo = () => undefined; // jsdom has no element scrolling
});
afterEach(cleanup);

describe("<SearchPage>", () => {
    it.each(allSearchPages().map((p) => [p.slug, p] as const))(
        "%s renders with one h1, headings in order and its picture described",
        (_, p) => {
            const { container } = render(
                <SearchPage
                    page={p}
                    links={{
                        startFree: "/start",
                        demo: "/demo",
                        hub: "/for",
                        page: (s) => `/for/${s}`,
                    }}
                />,
            );
            expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(
                1,
            );
            const levels = [...container.querySelectorAll("h1,h2,h3")].map(
                (h) => Number(h.tagName[1]),
            );
            levels.forEach(
                (l, i) =>
                    i > 0 &&
                    expect(l - (levels[i - 1] ?? 0)).toBeLessThanOrEqual(1),
            );
            expect(
                screen.getByRole("img", { name: p.scene.heroAlt }),
            ).toBeTruthy();
            for (const svg of container.querySelectorAll("svg"))
                expect(
                    svg.closest('[aria-hidden="true"],[role="img"]'),
                ).not.toBeNull();
            expect(
                screen
                    .getAllByRole("link", { name: "Start free" })[0]
                    ?.getAttribute("href"),
            ).toBe("/start");
            expect(
                screen
                    .getByRole("link", { name: p.related[0]?.name })
                    .getAttribute("href"),
            ).toBe(`/for/${p.related[0]?.slug}`);
            for (const q of p.questions)
                expect(screen.getByText(q.question)).toBeTruthy();
            expect(screen.queryByText(/Draft/)).toBeNull();
        },
    );

    it("draws nothing navigable when the app passes no links (the admin preview), and says when it's a draft", () => {
        const p = loadSearchPage("salons");
        if (!p) throw new Error("salons is missing");
        const { container } = render(<SearchPage page={p} draft />);
        expect(container.querySelectorAll("a[href]")).toHaveLength(0);
        expect(screen.getByText("Draft — not published yet")).toBeTruthy();
    });

    it("moves the carousel from its labels and opens the rest of Also in Saroh", () => {
        const p = loadSearchPage("yoga-studios");
        if (!p) throw new Error("yoga-studios is missing");
        render(<SearchPage page={p} />);
        const labs = within(
            screen.getByRole("group", { name: "Jump to" }),
        ).getAllByRole("button");
        expect(labs.map((b) => b.textContent)).toEqual([
            "Today",
            "Student",
            "Bill",
            "Website",
        ]);
        expect(labs[0]?.getAttribute("aria-pressed")).toBe("true");
        const student = labs[1];
        if (!student) throw new Error("no third label");
        fireEvent.click(student);
        expect(student.getAttribute("aria-pressed")).toBe("true");
        const more = screen.getByRole("button", { name: "See all 6" });
        fireEvent.click(more);
        expect(more.getAttribute("aria-expanded")).toBe("true");
        expect(more.textContent).toBe("Show fewer");
    });

    it("shows the pricing it is given, and no Pricing section without it", () => {
        const p = loadSearchPage("home-bakers");
        if (!p) throw new Error("home-bakers is missing");
        const { container, rerender } = render(<SearchPage page={p} />);
        expect(screen.queryByText("Pricing for home bakers")).toBeNull();
        // No live Free line: nothing after "No card needed", never a placeholder.
        expect(container.querySelector(".sp-free")).toBeNull();
        expect(container.textContent).not.toMatch(/\[[^\]]*\]/);
        rerender(
            <SearchPage
                page={p}
                pricing={<p>Plans</p>}
                freeLine="Free for one site"
            />,
        );
        expect(screen.getByText("Pricing for home bakers")).toBeTruthy();
        expect(screen.getByText("Free for one site")).toBeTruthy();
    });
});

describe("<ForHub>", () => {
    afterEach(() => window.history.replaceState(null, "", "/"));
    const hub = () =>
        render(<ForHub pages={listSearchPages({ kind: "for" })} />);
    const href = (name: RegExp) =>
        screen.getByRole("link", { name }).getAttribute("href");

    it("has every trade's link, with its promise and not its search phrase", () => {
        const pages = listSearchPages({ kind: "for" });
        const { container } = hub();
        const links = Array.from(
            container.querySelectorAll("a[href^='/for/']"),
        );
        expect(links.map((a) => a.getAttribute("href")).sort()).toEqual(
            pages.map((p) => p.path).sort(),
        );
        expect(
            screen.getByText("Every chair booked, and no one waiting."),
        ).toBeTruthy();
        expect(screen.queryByText("barber shop booking app")).toBeNull();
        expect(screen.getByRole("heading", { name: "Beauty" })).toBeTruthy();
    });

    it("finds a trade by the owner's own word, and a family keeps its main trade first", () => {
        hub();
        fireEvent.change(screen.getByRole("searchbox"), {
            target: { value: "dentist" },
        });
        expect(href(/^Dental clinics/)).toBe("/for/dental-clinics");
        expect(screen.queryByRole("link", { name: /^Barbers/ })).toBeNull();
        expect(window.location.search).toBe("?q=dentist");
        fireEvent.click(screen.getByRole("button", { name: "Reset all" }));
        fireEvent.click(screen.getByRole("button", { name: /^Beauty/ }));
        expect(window.location.search).toBe("?family=beauty");
        const first = document.querySelector(".sp-fh-big");
        expect(first?.getAttribute("href")).toBe("/for/salons");
        expect(first?.textContent).toContain("Today");
        expect(screen.queryByRole("link", { name: /^Gift shops/ })).toBeNull();
    });

    it("can't reach an empty list by filters, and says so when a search finds nothing", () => {
        hub();
        fireEvent.click(screen.getByRole("button", { name: /^Learning/ }));
        expect(
            screen
                .getByRole("button", { name: /^They place an order/ })
                .hasAttribute("disabled"),
        ).toBe(true);
        fireEvent.click(screen.getByRole("button", { name: "Reset all" }));
        fireEvent.change(screen.getByRole("searchbox"), {
            target: { value: "pet groomers" },
        });
        expect(
            screen.getByRole("heading", {
                name: 'No page for "pet groomers" yet',
            }),
        ).toBeTruthy();
    });

    it("reads its filters from the address, ignoring ones it doesn't know", () => {
        window.history.replaceState(
            null,
            "",
            "/for?family=health&how=nonsense",
        );
        hub();
        expect(
            screen
                .getByRole("button", { name: /^Health/ })
                .getAttribute("aria-pressed"),
        ).toBe("true");
        expect(screen.getByText("9 of 34 trades")).toBeTruthy();
    });
});

// prettier-plugin-tailwindcss strips the leading space of `" on"` inside a
// className template, gluing `vc-time on` into `vc-timeon` (DEV_LEARNINGS,
// 26 Oct). Every class the page draws must be one the stylesheet styles.
describe("class names", () => {
    const css = readFileSync(join(__dirname, "styles.css"), "utf8");
    it.each(allSearchPages().map((p) => [p.slug, p] as const))(
        "%s draws only classes styles.css knows",
        (_, p) => {
            const { container } = render(<SearchPage page={p} />);
            const unknown = new Set<string>();
            container.querySelectorAll("[class]").forEach((el) => {
                for (const c of (el.getAttribute("class") ?? "").split(/\s+/)) {
                    if (c && !new RegExp(`\\.${c}(?![\\w-])`).test(css))
                        unknown.add(c);
                }
            });
            expect([...unknown]).toEqual([]);
        },
    );
});

// A hand-merged stylesheet once lost a closing brace and failed the site's
// build, though every test here passed (26 Oct): it must still parse.
describe("styles.css", () => {
    it("closes every block it opens", () => {
        const css = readFileSync(join(__dirname, "styles.css"), "utf8")
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, "");
        let depth = 0;
        let lowest = 0;
        for (const ch of css) {
            if (ch === "{") depth++;
            if (ch === "}") depth--;
            lowest = Math.min(lowest, depth);
        }
        // One assertion, not one per character: CI timed out on 100k.
        expect({ lowest, end: depth }).toEqual({ lowest: 0, end: 0 });
    });
});
