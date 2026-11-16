// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Mark } from "./mark";
import { SplitHero } from "./split-hero";

afterEach(cleanup);

function parent(el: Element): HTMLElement {
    if (!el.parentElement) throw new Error("no parent");
    return el.parentElement;
}

describe("SplitHero", () => {
    it("draws the trail, the marked h1, the words and both buttons, top-aligned", () => {
        const { container } = render(
            <SplitHero
                id="page-title"
                crumbs={[
                    { name: "Features", href: "/features" },
                    { name: "Orders" },
                ]}
                title={
                    <>
                        Your <Mark>orders</Mark>
                    </>
                }
                lede="A lede"
                note={<p>A plan</p>}
                primary={<span id="hero-start">Start free</span>}
                secondary={<a href="#how">See how</a>}
                foot="Free to start"
            />,
        );
        const h1 = screen.getByRole("heading", { level: 1 });
        expect(h1.id).toBe("page-title");
        expect(h1.textContent).toBe("Your orders");
        expect(
            container.querySelector("section")?.getAttribute("aria-labelledby"),
        ).toBe("page-title");
        expect(container.querySelector("#hero-start")).not.toBeNull();
        expect(container.textContent).toContain("Free to start");
        const grid = parent(h1);
        expect(grid.className).toContain("items-start");
        expect(grid.className).not.toContain("items-end");
    });

    it("puts the h1 and its words in one column beside the picture", () => {
        render(
            <SplitHero
                layout="beside"
                title="A title"
                lede="A lede"
                picture={<div data-testid="pic" />}
            />,
        );
        const h1 = screen.getByRole("heading", { level: 1 });
        const column = parent(h1);
        expect(column.textContent).toContain("A lede");
        expect(column.nextElementSibling).toBe(screen.getByTestId("pic"));
        expect(parent(column).className).toContain("items-start");
    });
});

/** Every .tsx under src, tests aside. */
function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return sources(path);
        return path.endsWith(".tsx") && !path.includes(".test.") ? [path] : [];
    });
}

describe("two-column heads (#9, #26, #47)", () => {
    it("never bottom-align a grid that holds an h1 or h2", () => {
        const src = join(__dirname, "..");
        const found: string[] = [];
        for (const file of sources(src)) {
            const lines = readFileSync(file, "utf8").split("\n");
            lines.forEach((line, i) => {
                if (!/\bgrid\b/.test(line) || !/\bitems-end\b/.test(line))
                    return;
                // The element's first children: the next dozen lines.
                const next = lines.slice(i + 1, i + 13).join("\n");
                if (/<h[12]\b|text-mk-kit-h[12]|<SectionHeading\b/.test(next)) {
                    found.push(`${file.slice(src.length + 1)}:${i + 1}`);
                }
            });
        }
        expect(found).toEqual([]);
    });
});
