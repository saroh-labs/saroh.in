import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Notice } from "./notice";

const classes = (el: Element | null) => el?.className.split(/\s+/) ?? [];

describe("Notice", () => {
    it("gives its words the row's width, so a caller's button reaches the right edge", () => {
        // The column was once only as wide as its words: a row inside it
        // (words, then a button) could not push the button to the right.
        render(
            <Notice tone="info">
                <div data-testid="row">
                    <span>Words</span>
                    <button type="button">Change it</button>
                </div>
            </Notice>,
        );
        const words = screen.getByTestId("row").parentElement;
        expect(classes(words)).toContain("flex-1");
        expect(classes(words?.parentElement ?? null)).toContain("flex-1");
    });

    it("sets the glyph on the first line, or level with a caller's row when asked", () => {
        const { rerender } = render(<Notice tone="info">Words</Notice>);
        const column = () => screen.getByText("Words").parentElement;
        expect(classes(column())).toContain("items-start");
        expect(classes(column())).not.toContain("sm:items-center");
        rerender(
            <Notice tone="info" align="center">
                Words
            </Notice>,
        );
        expect(classes(column())).toContain("sm:items-center");
    });

    it("puts an action in its own group, after the words", () => {
        render(
            <Notice tone="info" action={<button type="button">Review</button>}>
                Words
            </Notice>,
        );
        const group = screen.getByRole("button", {
            name: "Review",
        }).parentElement;
        expect(classes(group)).toContain("shrink-0");
    });
});
