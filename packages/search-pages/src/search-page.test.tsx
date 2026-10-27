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
import { allSearchPages, listSearchPages, loadSearchPage } from "./load";

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
            "Pack",
            "Today",
            "Student",
            "Bill",
            "Website",
        ]);
        expect(labs[0]?.getAttribute("aria-pressed")).toBe("true");
        const student = labs[2];
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
    it("lists every page under its family", () => {
        render(<ForHub pages={listSearchPages()} />);
        const beauty = screen
            .getByRole("heading", { name: "Beauty" })
            .closest("section");
        if (!beauty) throw new Error("no Beauty section");
        expect(
            within(beauty)
                .getByRole("link", { name: /Salons/ })
                .getAttribute("href"),
        ).toBe("/for/salons");
        expect(screen.getByRole("heading", { name: "Health" })).toBeTruthy();
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
