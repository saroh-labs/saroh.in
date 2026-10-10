/** @vitest-environment jsdom */
import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = {
    suspendAction: vi.fn(),
    reinstateAction: vi.fn(),
    scheduleDeletionAction: vi.fn(),
    placeLegalHoldAction: vi.fn(),
    liftLegalHoldAction: vi.fn(),
};
vi.mock("@/lib/business-actions", () => ({
    suspendAction: (...a: unknown[]) => actions.suspendAction(...a) as unknown,
    reinstateAction: (...a: unknown[]) =>
        actions.reinstateAction(...a) as unknown,
    scheduleDeletionAction: (...a: unknown[]) =>
        actions.scheduleDeletionAction(...a) as unknown,
    placeLegalHoldAction: (...a: unknown[]) =>
        actions.placeLegalHoldAction(...a) as unknown,
    liftLegalHoldAction: (...a: unknown[]) =>
        actions.liftLegalHoldAction(...a) as unknown,
}));

import type { BusinessView } from "@/lib/businesses";

import { DeletionPanels } from "./deletion-panels";
import { LegalHoldNotice } from "./legal-hold-notice";
import { LEGAL_HOLD_CHECKBOX, LifecycleActions } from "./lifecycle-actions";

/**
 * The console's words and controls for a legal hold and for how long a
 * deleted business's data is kept (DEC-119, owner 10 Oct).
 */
const buttons = () =>
    screen.queryAllByRole("button").map((b) => b.textContent.trim());

/** The dialog's "Type ‹name› to confirm" field. */
function nameField(): HTMLInputElement {
    const field = document.querySelector<HTMLInputElement>(
        'input[name="confirmName"]',
    );
    if (!field) throw new Error("no confirm-name field");
    return field;
}

beforeEach(() => {
    for (const action of Object.values(actions)) {
        action.mockReset().mockResolvedValue({ ok: true });
    }
});
afterEach(cleanup);

describe("LifecycleActions and a legal hold", () => {
    it("asks, in the owner's words, whether a suspension keeps the data", () => {
        expect(LEGAL_HOLD_CHECKBOX).toBe(
            "Suspended for activity the law prohibits — keep its data",
        );
    });

    it("suspends with the hold when the box is ticked, with the reason given", async () => {
        render(
            <LifecycleActions
                organizationId="org_1"
                name="Rye Bakery"
                status="ACTIVE"
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Suspend" }));
        fireEvent.click(screen.getByLabelText(LEGAL_HOLD_CHECKBOX));
        fireEvent.change(screen.getByLabelText(/Reason/), {
            target: { value: "Selling counterfeit goods" },
        });
        fireEvent.change(nameField(), {
            target: { value: "Rye Bakery" },
        });
        fireEvent.click(
            screen.getByRole("button", { name: "Suspend business" }),
        );
        await waitFor(() =>
            expect(actions.suspendAction).toHaveBeenCalledWith(
                "org_1",
                expect.objectContaining({
                    reason: "Selling counterfeit goods",
                    confirmName: "Rye Bakery",
                    legalHold: true,
                }),
            ),
        );
    });

    it("suspends without a hold when the box is left alone", async () => {
        render(
            <LifecycleActions
                organizationId="org_1"
                name="Rye Bakery"
                status="ACTIVE"
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Suspend" }));
        fireEvent.change(screen.getByLabelText(/Reason/), {
            target: { value: "Chargeback investigation" },
        });
        fireEvent.change(nameField(), {
            target: { value: "Rye Bakery" },
        });
        fireEvent.click(
            screen.getByRole("button", { name: "Suspend business" }),
        );
        await waitFor(() =>
            expect(actions.suspendAction).toHaveBeenCalledWith(
                "org_1",
                expect.objectContaining({ legalHold: false }),
            ),
        );
    });

    it("offers a hold on a business already suspended, closing or deleted, never an active one", () => {
        for (const status of [
            "SUSPENDED",
            "PENDING_DELETION",
            "DELETED_RETAINED",
        ] as const) {
            render(
                <LifecycleActions
                    organizationId="org_1"
                    name="Rye Bakery"
                    status={status}
                />,
            );
            expect(buttons()).toContain("Place legal hold");
            cleanup();
        }
        render(
            <LifecycleActions
                organizationId="org_1"
                name="Rye Bakery"
                status="ACTIVE"
            />,
        );
        expect(buttons()).not.toContain("Place legal hold");
    });

    it("places the hold with a reason", async () => {
        render(
            <LifecycleActions
                organizationId="org_1"
                name="Rye Bakery"
                status="SUSPENDED"
            />,
        );
        fireEvent.click(
            screen.getByRole("button", { name: "Place legal hold" }),
        );
        fireEvent.change(screen.getByLabelText(/Why its data must be kept/), {
            target: { value: "Police notice 14/2026" },
        });
        const submit = screen
            .getAllByRole("button", { name: "Place legal hold" })
            .at(-1);
        if (!submit) throw new Error("no submit");
        fireEvent.click(submit);
        await waitFor(() =>
            expect(actions.placeLegalHoldAction).toHaveBeenCalledWith(
                "org_1",
                expect.objectContaining({ reason: "Police notice 14/2026" }),
            ),
        );
    });

    it("offers no way to reinstate or delete a held business, and says why", () => {
        render(
            <LifecycleActions
                organizationId="org_1"
                name="Rye Bakery"
                status="SUSPENDED"
                held
            />,
        );
        expect(buttons()).toEqual([]);
        expect(
            screen.getByText(/until a Platform Owner lifts the\s+hold/),
        ).toBeTruthy();
        cleanup();

        render(
            <LifecycleActions
                organizationId="org_1"
                name="Rye Bakery"
                status="PENDING_DELETION"
                held
            />,
        );
        expect(buttons()).not.toContain("Cancel deletion");
        expect(buttons()).not.toContain("Schedule deletion");
    });

    it("offers Lift legal hold only to an operator who may lift one", async () => {
        render(
            <LifecycleActions
                organizationId="org_1"
                name="Rye Bakery"
                status="SUSPENDED"
                held
                canLiftHold
            />,
        );
        expect(buttons()).toEqual(["Lift legal hold"]);
        fireEvent.click(
            screen.getByRole("button", { name: "Lift legal hold" }),
        );
        fireEvent.change(screen.getByLabelText(/Why the hold can be lifted/), {
            target: { value: "Case closed, order of 2 Dec" },
        });
        const submit = screen
            .getAllByRole("button", { name: "Lift legal hold" })
            .at(-1);
        if (!submit) throw new Error("no submit");
        fireEvent.click(submit);
        await waitFor(() =>
            expect(actions.liftLegalHoldAction).toHaveBeenCalledWith(
                "org_1",
                expect.objectContaining({
                    reason: "Case closed, order of 2 Dec",
                }),
            ),
        );
    });

    it("tells whoever schedules a deletion that the data is kept 180 days", () => {
        render(
            <LifecycleActions
                organizationId="org_1"
                name="Rye Bakery"
                status="ACTIVE"
            />,
        );
        fireEvent.click(
            screen.getByRole("button", { name: "Schedule deletion" }),
        );
        expect(screen.getByText(/kept for 180 days more/)).toBeTruthy();
        expect(screen.getByText(/stay as tax records/)).toBeTruthy();
    });
});

describe("LegalHoldNotice", () => {
    it("says who placed it, when and why, and what it means", () => {
        render(
            <LegalHoldNotice
                hold={{
                    at: "2026-10-10T06:00:00.000Z",
                    reason: "Police notice 14/2026",
                    byUserId: "u1",
                    by: "Priya",
                }}
            />,
        );
        const notice = screen.getByRole("status", { name: "Legal hold" });
        expect(notice.textContent).toMatch(/Placed \d{1,2} Oct 2026 by Priya/);
        expect(notice.textContent).toContain("Why: Police notice 14/2026");
        expect(notice.textContent).toContain("Nothing deletes or erases it");
        expect(notice.textContent).toContain("Platform Owner");
    });
});

describe("the deletion trail and how long the data is kept", () => {
    const view = (facts: Record<string, unknown>, trail: unknown[] = []) =>
        ({
            facts: {
                id: "org_1",
                name: "Rye Bakery",
                lifecycleStatus: "DELETED_RETAINED",
                deletionScheduledAt: null,
                ...facts,
            },
            deletionTrail: { status: "ok", data: trail },
            deletionRefunds: { status: "ok", data: [] },
        }) as unknown as BusinessView;

    it("shows “Data kept until ‹date›” for a deleted business", () => {
        render(
            <DeletionPanels
                view={view({ dataKeptUntil: "2027-04-08T08:00:00.000Z" })}
            />,
        );
        const kept = screen.getByTestId("data-kept");
        expect(kept.textContent).toMatch(/Data kept until \d{1,2} Apr 2027/);
        expect(kept.textContent).toContain("kept for 180 days");
    });

    it("says when it was erased, and that a legal hold keeps it past the date", () => {
        render(
            <DeletionPanels
                view={view({
                    dataKeptUntil: "2027-04-08T08:00:00.000Z",
                    retentionErasedAt: "2027-04-09T02:00:00.000Z",
                })}
            />,
        );
        expect(screen.getByTestId("data-kept").textContent).toMatch(
            /Data erased on \d{1,2} Apr 2027/,
        );
        cleanup();
        render(
            <DeletionPanels
                view={view({
                    dataKeptUntil: "2027-04-08T08:00:00.000Z",
                    legalHold: {
                        at: "2026-12-01T00:00:00.000Z",
                        reason: "x",
                        byUserId: null,
                        by: null,
                    },
                })}
            />,
        );
        expect(screen.getByTestId("data-kept").textContent).toContain(
            "Data kept while it is on legal hold",
        );
    });

    it("shows no such line for a business that isn't deleted", () => {
        render(
            <DeletionPanels
                view={view({ lifecycleStatus: "SUSPENDED" }, [
                    {
                        id: "t1",
                        action: "organization.legal_hold.placed",
                        outcome: "SUCCESS",
                        reason: "Police notice 14/2026",
                        actor: "Priya",
                        actorUserId: "u1",
                        createdAt: "2026-10-10T06:00:00.000Z",
                        refunds: null,
                        steps: null,
                    },
                ])}
            />,
        );
        expect(screen.queryByTestId("data-kept")).toBeNull();
        expect(screen.getByText("Legal hold placed")).toBeTruthy();
        expect(screen.getByText("Police notice 14/2026 · Priya")).toBeTruthy();
    });
});
