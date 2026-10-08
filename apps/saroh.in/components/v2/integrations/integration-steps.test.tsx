// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { IntegrationStep } from "@/content/integrations";

import { IntegrationSteps } from "./integration-steps";

afterEach(cleanup);

const step = (title: string): IntegrationStep => ({
    title,
    body: `${title} body`,
    rows: [
        {
            label: `${title} field`,
            value: "v",
            mono: false,
            done: false,
            tone: "muted",
        },
    ],
});
const steps = [step("One"), step("Two"), step("Three")];

function current() {
    return screen
        .getAllByRole("button")
        .find((b) => b.getAttribute("aria-current") === "step")?.textContent;
}

describe("IntegrationSteps", () => {
    it("opens on the step it is given and shows only its panel", () => {
        render(
            <IntegrationSteps
                steps={steps}
                panelPath={["Settings", "Providers"]}
                initialStep={1}
            />,
        );
        expect(current()).toContain("Two");
        expect(screen.getByText("Two body")).toBeTruthy();
        expect(screen.getByText("One body").closest("[hidden]")).not.toBeNull();
    });

    it("moves by click and by arrow keys, Home and End, wrapping", () => {
        render(
            <IntegrationSteps
                steps={steps}
                panelPath={["Settings", "Providers"]}
            />,
        );
        const [first, , third] = screen.getAllByRole("button");
        fireEvent.click(third);
        expect(current()).toContain("Three");
        fireEvent.keyDown(third, { key: "ArrowDown" });
        expect(current()).toContain("One");
        expect(document.activeElement).toBe(first);
        fireEvent.keyDown(first, { key: "ArrowUp" });
        expect(current()).toContain("Three");
        fireEvent.keyDown(third, { key: "Home" });
        expect(current()).toContain("One");
        fireEvent.keyDown(first, { key: "End" });
        expect(current()).toContain("Three");
    });
});
