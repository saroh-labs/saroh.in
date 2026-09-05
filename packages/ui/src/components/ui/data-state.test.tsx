import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
    CapabilityOffState,
    EmptyState,
    FailedState,
    LoadingState,
    PartialNotice,
    PermissionDeniedState,
} from "./data-state";

/**
 * These pin the DISTINCTIONS, not the styling.
 *
 * §30 requires a merchant to be able to tell why a screen has nothing on it.
 * The failure mode this guards against is regression by convenience: someone
 * reaches for `EmptyState` because it is closest to hand, and a failed query
 * starts reporting "nothing to do" again.
 */
describe("product states are distinguishable", () => {
    it("announces a failure as an alert", () => {
        render(<FailedState title="Orders could not be loaded" />);

        expect(screen.getByRole("alert")).toHaveTextContent(
            "Orders could not be loaded",
        );
    });

    // The whole point: an empty list and a failed query must not present the
    // same way. If this ever passes with `getByRole("alert")`, the two have
    // collapsed back together.
    it("does not announce an empty list as an alert", () => {
        render(<EmptyState title="No orders yet" />);

        expect(screen.queryByRole("alert")).toBeNull();
        expect(
            screen.getByRole("heading", { name: "No orders yet" }),
        ).toBeInTheDocument();
    });

    it("says a failure may not be the whole picture, and that nothing changed", () => {
        render(<FailedState />);

        expect(screen.getByRole("alert")).toHaveTextContent(
            /nothing has been changed/i,
        );
    });

    it("marks a loading surface busy rather than reading out empty boxes", () => {
        const { container } = render(
            <LoadingState rows={4} label="Loading orders" />,
        );

        const region = container.firstElementChild;
        expect(region).toHaveAttribute("aria-busy", "true");
        expect(screen.getByText("Loading orders")).toBeInTheDocument();
    });

    it("reports partial data as a status, saying what is missing", () => {
        render(
            <PartialNotice>
                Bookings could not be reached, so this shows orders only.
            </PartialNotice>,
        );

        expect(screen.getByRole("status")).toHaveTextContent(
            /bookings could not be reached/i,
        );
    });

    // A capability being off is not a failure and must not be alarming — but it
    // also must not read as "you have no orders".
    it("names the capability that is off, without alarming", () => {
        render(
            <CapabilityOffState
                title="Commerce is turned off"
                description="Nothing it holds has been deleted."
            />,
        );

        expect(screen.queryByRole("alert")).toBeNull();
        expect(
            screen.getByRole("heading", { name: "Commerce is turned off" }),
        ).toBeInTheDocument();
        expect(
            screen.getByText(/nothing it holds has been deleted/i),
        ).toBeInTheDocument();
    });

    it("explains a permission denial instead of hiding the surface", () => {
        render(
            <PermissionDeniedState description="An owner can grant access." />,
        );

        expect(
            screen.getByRole("heading", {
                name: /you do not have access to this/i,
            }),
        ).toBeInTheDocument();
        expect(
            screen.getByText("An owner can grant access."),
        ).toBeInTheDocument();
    });

    it("renders the retry a failed state offers", () => {
        render(
            <FailedState action={<button type="button">Try again</button>} />,
        );

        expect(
            screen.getByRole("button", { name: "Try again" }),
        ).toBeInTheDocument();
    });

    // §19: no affordance may depend on hover, because the phone and the shop
    // floor have none. Every state must be fully readable from its text.
    it.each([
        ["ready", <EmptyState key="r" title="No orders yet" />],
        ["off", <CapabilityOffState key="o" title="Commerce is turned off" />],
        ["denied", <PermissionDeniedState key="d" />],
        ["failed", <FailedState key="f" />],
    ])("states its meaning in text, not on hover (%s)", (_label, element) => {
        const { container } = render(element);

        expect(container.querySelector("[title]")).toBeNull();
        expect(container.textContent.trim().length).toBeGreaterThan(0);
    });
});
