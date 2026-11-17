// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StepsShowcase } from "./steps-showcase";

afterEach(cleanup);

function found<T>(x: T | null | undefined): T {
    if (x == null) throw new Error("not found");
    return x;
}

const steps = ["Open", "Ask", "Answer", "Confirm"].map((title) => ({
    title,
    body: `${title} body`,
    picture: <p>{title} picture</p>,
    note: "Rye & Co. (demo bakery)",
}));

function show() {
    return render(
        <StepsShowcase
            id="how"
            title="Ask in your own words."
            lede="A lede"
            steps={steps}
            foot="History keeps them for 90 days."
            links={[{ href: "/help/ask", label: "How to ask" }]}
        />,
    );
}

const pressed = () =>
    screen.getAllByRole("button").map((b) => b.getAttribute("aria-pressed"));

describe("StepsShowcase", () => {
    it("draws every step's picture in the HTML, each under its own step", () => {
        const { container } = show();
        expect(
            screen.getByRole("heading", { level: 2, name: /own words/ }),
        ).toBeTruthy();
        for (const s of steps) {
            const picture = screen.getByText(`${s.title} picture`);
            // Nothing is behind a tap: no picture is hidden from the HTML.
            expect(picture.closest("[hidden]")).toBeNull();
            expect(picture.closest("li")?.textContent).toContain(s.body);
        }
        expect(container.querySelectorAll("[data-step-picture]")).toHaveLength(
            4,
        );
        expect(screen.getByText(/90 days/)).toBeTruthy();
        expect(screen.getByRole("link", { name: /How to ask/ })).toBeTruthy();
    });

    it("picks a step on click and with the arrow keys", () => {
        const { container } = show();
        const pic = (i: number) =>
            container.querySelector(`[data-step-picture="${i}"]`);
        expect(pressed()).toEqual(["true", "false", "false", "false"]);
        // On a desk, only the picked step's picture shows in the panel.
        expect(pic(0)?.className).not.toContain("min-[1080px]:hidden");
        expect(pic(2)?.className).toContain("min-[1080px]:hidden");

        fireEvent.click(screen.getByRole("button", { name: /Answer/ }));
        expect(pressed()).toEqual(["false", "false", "true", "false"]);
        expect(pic(2)?.className).not.toContain("min-[1080px]:hidden");
        expect(pic(0)?.className).toContain("min-[1080px]:hidden");

        const third = screen.getByRole("button", { name: /Answer/ });
        fireEvent.keyDown(third, { key: "ArrowDown" });
        expect(pressed()).toEqual(["false", "false", "false", "true"]);
        expect(document.activeElement?.textContent).toContain("Confirm");
        fireEvent.keyDown(found(document.activeElement), {
            key: "ArrowDown",
        });
        expect(pressed()[0]).toBe("true");
        // Each button names the picture it shows.
        const first = screen.getAllByRole("button")[0];
        const controls = first.getAttribute("aria-controls") ?? "";
        expect(container.querySelector(`[id="${controls}"]`)).toBe(pic(0));
    });
});
