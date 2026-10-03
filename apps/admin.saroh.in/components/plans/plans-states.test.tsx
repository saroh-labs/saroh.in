/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PlansFailed } from "./plans-failed";
import { PlansSkeleton } from "./plans-skeleton";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh }),
}));

afterEach(cleanup);

describe("before the catalogue is read", () => {
    it("draws a skeleton and no status bar while it loads", () => {
        render(<PlansSkeleton />);
        expect(screen.getByText("Loading plans and modules")).toBeTruthy();
        expect(screen.queryByText("Live")).toBeNull();
        expect(screen.queryByText(/^Draft/)).toBeNull();
    });

    it("says a failed read failed, offers Try again and draws no fields", () => {
        render(<PlansFailed />);
        expect(screen.getByRole("alert").textContent).toContain(
            "Plans and modules could not be loaded",
        );
        expect(screen.queryByRole("textbox")).toBeNull();
        expect(screen.queryByRole("tablist")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Try again" }));
        expect(refresh).toHaveBeenCalled();
    });
});
