import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { markTitle, PageHero } from "./page-hero";

const marked = (title: string, word?: string) =>
    render(<h1>{markTitle(title, word)}</h1>).container.querySelector("span")
        ?.textContent;

describe("markTitle", () => {
    it("marks the last word, punctuation and all", () => {
        expect(marked("Start for free.")).toBe("free.");
    });
    it("marks the chosen word, else the last", () => {
        expect(marked("Help for everything in Saroh", "everything")).toBe(
            "everything",
        );
        expect(marked("Help for everything", "nothing")).toBe("everything");
    });
});

describe("PageHero", () => {
    it("draws one h1 with the whole title", () => {
        const { container } = render(
            <PageHero crumbs={[{ name: "About" }]} title="About Saroh" />,
        );
        expect(container.querySelectorAll("h1")).toHaveLength(1);
        expect(container.querySelector("h1")?.textContent).toBe("About Saroh");
    });
});
