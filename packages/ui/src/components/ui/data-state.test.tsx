import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

import type { StateSize } from "./data-state";
import {
    EmptyState,
    FailedState,
    LimitReachedState,
    LoadingState,
    ModuleOffState,
    NotPublishedNotice,
    PartialNotice,
    PausedState,
    PermissionDeniedState,
    PlanLockedState,
    ProviderDisconnectedState,
    SignedOutState,
} from "./data-state";

/**
 * These pin the DISTINCTIONS, not the styling.
 *
 * §30 requires a merchant to be able to tell why a screen has nothing on it.
 * The failure mode this guards against is regression by convenience: someone
 * reaches for `EmptyState` because it is closest to hand, and a failed query
 * starts reporting "nothing to do" again.
 */
const SIZES: StateSize[] = ["page", "panel", "inline"];

/** Every named state, in a given size, with what it must say. */
const states = (
    size: StateSize,
): [name: string, element: ReactElement, says: RegExp][] => [
    [
        "empty",
        <EmptyState key="e" size={size} title="No orders yet" />,
        /No orders yet/,
    ],
    [
        "no-results",
        <EmptyState
            key="n"
            size={size}
            kind="no-results"
            things="orders"
            query="rye"
            onClear={() => undefined}
        />,
        /No orders match “rye”/,
    ],
    [
        "off",
        <ModuleOffState key="o" size={size} name="Bookings" canTurnOn />,
        /Bookings is turned off/,
    ],
    [
        "plan",
        <PlanLockedState
            key="p"
            size={size}
            name="Bookings"
            plan="Grow"
            href="/settings/billing"
            canChangePlan
        />,
        /Bookings comes with Grow/,
    ],
    [
        "limit",
        <LimitReachedState
            key="l"
            size={size}
            title="You're at 10 of 10 products"
            href="/settings/billing"
            canChangePlan
        />,
        /You're at 10 of 10 products/,
    ],
    [
        "not-connected",
        <ProviderDisconnectedState key="c" size={size} provider="payment" />,
        /payment provider/i,
    ],
    [
        "not-published",
        <NotPublishedNotice key="u" size={size} />,
        /Your website isn't live yet/,
    ],
    [
        "denied",
        <PermissionDeniedState key="d" size={size} />,
        /You can't open this/,
    ],
    [
        "paused",
        <PausedState key="s" size={size} business="Rye" />,
        /Your access to Rye is paused/,
    ],
    [
        "signed-out",
        <SignedOutState key="x" size={size} signInHref="/login" />,
        /Your session has ended/,
    ],
    [
        "failed",
        <FailedState key="f" size={size} onRetry={() => undefined} />,
        /Couldn't load this/,
    ],
];

describe.each(SIZES)("every state at %s size", (size) => {
    it.each(states(size))("%s says what it is", (name, element, says) => {
        const { container } = render(element);
        const root = container.firstElementChild;

        expect(root).toHaveAttribute("data-state", name);
        expect(root).toHaveAttribute("data-state-size", size);
        expect(root).toHaveTextContent(says);
        // §19: nothing may be explained by a tooltip. The phone and the shop
        // floor have no hover.
        expect(container.querySelector("[title]")).toBeNull();
    });

    it.each(states(size))(
        "%s is an alert only when it is the failed one",
        (name, element) => {
            render(element);
            if (name === "failed") {
                expect(screen.getByRole("alert")).toBeInTheDocument();
            } else {
                expect(screen.queryByRole("alert")).toBeNull();
            }
        },
    );

    it("names a card with a heading, and a line with none", () => {
        render(<EmptyState size={size} title="No orders yet" />);
        const heading = screen.queryByRole("heading", {
            name: "No orders yet",
        });
        if (size === "inline") {
            expect(heading).toBeNull();
            // A title is a sentence once it sits in a line.
            expect(screen.getByText("No orders yet.")).toBeInTheDocument();
        } else {
            expect(heading).toHaveProperty(
                "tagName",
                size === "page" ? "H2" : "H3",
            );
        }
    });

    it("draws a wall for a denial and a space to fill for an empty", () => {
        const { container: denied } = render(
            <PermissionDeniedState size={size} />,
        );
        const { container: empty } = render(
            <EmptyState size={size} title="No orders yet" />,
        );
        if (size === "inline") return;
        expect(denied.firstElementChild).toHaveClass("border-solid");
        expect(empty.firstElementChild).toHaveClass("border-dashed");
    });
});

describe("EmptyState", () => {
    it("offers the action of someone who may create", () => {
        render(
            <EmptyState
                title="No services yet"
                description="Add what customers can book: a one-to-one or a class."
                action={<a href="/services/new">New service</a>}
            />,
        );
        expect(
            screen.getByRole("link", { name: "New service" }),
        ).toHaveAttribute("href", "/services/new");
    });

    it("never announces an empty list as an alert", () => {
        render(<EmptyState title="No orders yet" />);
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it.each([
        ["search", "Clear search", "No invoices match “rye”"],
        ["filters", "Clear filters", "No invoices match"],
        ["view", "Show all invoices", "No invoices here"],
    ] as const)(
        "names what %s left empty and offers the way back",
        (cause, label, title) => {
            const onClear = vi.fn();
            render(
                <EmptyState
                    kind="no-results"
                    things="invoices"
                    cause={cause}
                    query="rye"
                    onClear={onClear}
                />,
            );
            expect(
                screen.getByRole("heading", { name: title }),
            ).toBeInTheDocument();
            fireEvent.click(screen.getByRole("button", { name: label }));
            expect(onClear).toHaveBeenCalledOnce();
        },
    );

    it("clears by address for a server-rendered list", () => {
        render(
            <EmptyState
                kind="no-results"
                things="orders"
                cause="filters"
                clearHref="/commerce/orders"
            />,
        );
        expect(
            screen.getByRole("link", { name: "Clear filters" }),
        ).toHaveAttribute("href", "/commerce/orders");
    });

    it("does not say “No X yet” when a search left nothing", () => {
        render(<EmptyState kind="no-results" things="orders" query="rye" />);
        expect(screen.queryByText(/yet/)).toBeNull();
    });
});

describe("FailedState", () => {
    it("says nothing was changed, and offers Try again that reads again", () => {
        const onRetry = vi.fn();
        render(<FailedState title="Couldn't load orders" onRetry={onRetry} />);

        const alert = screen.getByRole("alert");
        expect(alert).toHaveTextContent("Couldn't load orders");
        expect(alert).toHaveTextContent("Nothing has been changed.");
        fireEvent.click(screen.getByRole("button", { name: "Try again" }));
        expect(onRetry).toHaveBeenCalledOnce();
    });

    it("is a real button, so the keyboard reaches Try again", () => {
        render(<FailedState onRetry={() => undefined} />);
        const button = screen.getByRole("button", { name: "Try again" });
        expect(button).toHaveAttribute("type", "button");
        button.focus();
        expect(button).toHaveFocus();
    });

    it("waits while the retry is on its way", () => {
        render(<FailedState onRetry={() => undefined} retrying />);
        expect(
            screen.getByRole("button", { name: "Try again" }),
        ).toBeDisabled();
    });

    it("tries again by address for a server-rendered state", () => {
        render(<FailedState retryHref="/services" />);
        expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute(
            "href",
            "/services",
        );
    });

    it("shows the reference support can look a failure up by", () => {
        render(<FailedState reference="d1g3st" />);
        expect(screen.getByText("Reference: d1g3st")).toBeInTheDocument();
    });

    it("never tells anyone to reload the page", () => {
        render(<FailedState onRetry={() => undefined} />);
        expect(screen.getByRole("alert")).not.toHaveTextContent(
            /reload|refresh/i,
        );
    });
});

describe("PermissionDeniedState", () => {
    it("explains a denial instead of hiding the surface, with who can change it", () => {
        render(
            <PermissionDeniedState
                title="You can't open Bookings"
                description="Your role doesn't include Bookings."
                note="An owner or admin can change this in Settings › Team."
            />,
        );
        expect(
            screen.getByRole("heading", { name: "You can't open Bookings" }),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                "An owner or admin can change this in Settings › Team.",
            ),
        ).toBeInTheDocument();
        // Nothing failed, so there is nothing to retry.
        expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    });
});

describe("PausedState and SignedOutState", () => {
    it("says paused, not “no access”, and points at the plan", () => {
        render(<PausedState business="Rye & Co." />);
        const card = screen.getByRole("heading", {
            name: "Your access to Rye & Co. is paused",
        }).parentElement;
        expect(card).toHaveAttribute("data-state", "paused");
        expect(card).not.toHaveTextContent(/can't open|role/i);
        expect(card).toHaveTextContent(/Plan and billing/);
    });

    it("offers one action to a session that ran out: Sign in", () => {
        render(
            <SignedOutState signInHref="https://accounts.example.com/login" />,
        );
        expect(
            screen.getByRole("heading", { name: "Your session has ended" }),
        ).toBeInTheDocument();
        expect(
            screen.getByText("Sign in again to pick up where you left off."),
        ).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
            "href",
            "https://accounts.example.com/login",
        );
        expect(screen.queryByText(/role|owner|admin/i)).toBeNull();
    });
});

describe("ModuleOffState, PlanLockedState and LimitReachedState", () => {
    it("says a module is off, that nothing is deleted, and where to turn it on", () => {
        render(<ModuleOffState name="Bookings" canTurnOn />);
        expect(
            screen.getByRole("heading", { name: "Bookings is turned off" }),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                "Nothing is deleted. Turn it on to bring it back.",
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("link", { name: "Turn on in Modules" }),
        ).toHaveAttribute("href", "/settings/modules");
    });

    it("tells someone who can't turn it on who can, as text", () => {
        render(<ModuleOffState name="Bookings" canTurnOn={false} />);
        expect(screen.queryByRole("link")).toBeNull();
        expect(
            screen.getByText(
                "An owner or admin can turn it on in Settings › Modules.",
            ),
        ).toBeInTheDocument();
        // No promise of a switch they can't press.
        expect(screen.queryByText(/Turn it on to/)).toBeNull();
    });

    it("labels the plan link “See {Plan}” when one plan unlocks it", () => {
        render(
            <PlanLockedState
                name="Bookings"
                plan="Grow"
                href="/settings/billing?plan=grow"
                canChangePlan
            />,
        );
        expect(screen.getByRole("link", { name: "See Grow" })).toHaveAttribute(
            "href",
            "/settings/billing?plan=grow",
        );
    });

    it("labels it “See plans” otherwise", () => {
        render(
            <PlanLockedState
                name="Bookings"
                href="/settings/billing"
                canChangePlan
            />,
        );
        expect(
            screen.getByRole("heading", {
                name: "Bookings isn't in your plan",
            }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("link", { name: "See plans" }),
        ).toBeInTheDocument();
    });

    it("gives someone who can't change the plan text, not a link", () => {
        render(
            <PlanLockedState
                name="Bookings"
                plan="Grow"
                href="/settings/billing"
                canChangePlan={false}
            />,
        );
        expect(screen.queryByRole("link")).toBeNull();
        expect(
            screen.getByText(
                "The owner can change the plan in Settings › Plan and billing.",
            ),
        ).toBeInTheDocument();
    });

    it("says where a limit is, with the plan link and a way back", () => {
        render(
            <LimitReachedState
                title="You're at 10 of 10 products"
                description="Archive or delete one to make room, or move to a plan with more."
                plan="Grow"
                href="/settings/billing"
                canChangePlan
                secondary={<a href="/commerce/products">Back to Products</a>}
            />,
        );
        expect(
            screen.getByRole("link", { name: "See Grow" }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("link", { name: "Back to Products" }),
        ).toBeInTheDocument();
    });

    it("has no plan link for a limit no plan lifts", () => {
        render(<LimitReachedState title="You already have a website" />);
        expect(screen.queryByRole("link")).toBeNull();
    });

    it("gives the three their own icons, so none reads as another", () => {
        const icon = (el: ReactElement) =>
            render(el).container.querySelector("svg")?.getAttribute("class");
        const off = icon(<ModuleOffState name="Bookings" canTurnOn />);
        const plan = icon(
            <PlanLockedState name="Bookings" href="/x" canChangePlan />,
        );
        const limit = icon(
            <LimitReachedState title="You're at 10" href="/x" />,
        );
        expect(new Set([off, plan, limit]).size).toBe(3);
    });
});

describe("ProviderDisconnectedState and NotPublishedNotice", () => {
    it.each([
        ["payment", "No payment provider connected"],
        ["email", "No email provider connected"],
    ] as const)(
        "says the %s provider is missing, with one action",
        (kind, title) => {
            render(<ProviderDisconnectedState provider={kind} />);
            expect(
                screen.getByRole("heading", { name: title }),
            ).toBeInTheDocument();
            expect(
                screen.getByRole("link", { name: "Connect in Providers" }),
            ).toHaveAttribute("href", "/settings/providers");
        },
    );

    it("says it in one line where it sits in a row", () => {
        render(<ProviderDisconnectedState size="inline" provider="payment" />);
        expect(
            screen.getByText(
                "No payment provider is connected, so customers can't pay online.",
            ),
        ).toBeInTheDocument();
    });

    it("tells someone who can't connect one who can", () => {
        render(
            <ProviderDisconnectedState provider="payment" canConnect={false} />,
        );
        expect(screen.queryByRole("link")).toBeNull();
        expect(
            screen.getByText(
                "An owner or admin can connect one in Settings › Providers.",
            ),
        ).toBeInTheDocument();
    });

    it("says the website isn't live, with the way to Website", () => {
        render(<NotPublishedNotice href="/sites/s1" />);
        expect(
            screen.getByText("Your website isn't live yet."),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("link", { name: "Go to Website" }),
        ).toHaveAttribute("href", "/sites/s1");
    });

    it("gives someone who can't publish text, not a link", () => {
        render(<NotPublishedNotice canPublish={false} />);
        expect(screen.queryByRole("link")).toBeNull();
    });
});

describe("PartialNotice and LoadingState", () => {
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
});
