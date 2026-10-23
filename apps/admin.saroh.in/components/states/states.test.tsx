/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChangedRow } from "../changed-row";
import { EmptyPanel } from "./empty-panel";
import { FailedPanel } from "./failed-panel";
import { PanelSkeleton } from "./panel-skeleton";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh }),
}));

afterEach(cleanup);

describe("shared console states", () => {
    it("says what is loading, once, and hides the grey", () => {
        render(<PanelSkeleton label="Loading businesses" />);
        const status = screen.getByRole("status");
        expect(status.getAttribute("aria-busy")).toBe("true");
        expect(screen.getByText("Loading businesses")).toBeTruthy();
    });

    it("says a failed read failed and reads again on Try again", () => {
        render(<FailedPanel things="businesses" />);
        const alert = screen.getByRole("alert");
        expect(alert.textContent).toContain("Couldn't load businesses");
        expect(alert.textContent).toContain("Nothing has been changed.");
        fireEvent.click(screen.getByRole("button", { name: "Try again" }));
        expect(refresh).toHaveBeenCalled();
    });

    it("draws the one empty card, and the way back from a filter", () => {
        const onClear = vi.fn();
        render(
            <EmptyPanel
                kind="no-results"
                things="businesses"
                cause="view"
                onClear={onClear}
            />,
        );
        fireEvent.click(
            screen.getByRole("button", { name: "Show all businesses" }),
        );
        expect(onClear).toHaveBeenCalled();
    });

    it("marks a changed row for the highlight", () => {
        const { rerender, container } = render(
            <ChangedRow as="li" changed>
                Org 1
            </ChangedRow>,
        );
        const row = container.querySelector("li");
        expect(row?.hasAttribute("data-just-changed")).toBe(true);
        expect(row?.hasAttribute("data-changed-row")).toBe(true);
        rerender(
            <ChangedRow as="li" changed={false}>
                Org 1
            </ChangedRow>,
        );
        expect(row?.hasAttribute("data-just-changed")).toBe(false);
    });
});
