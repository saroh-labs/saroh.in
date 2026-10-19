/** @vitest-environment jsdom */
import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
    EarningsSummary,
    PayoutRow,
    PayoutStatement,
    RatesView,
    RateView,
} from "@/lib/commission-words";

const actions = vi.hoisted(() => ({
    markPayoutPaidAction: vi.fn(),
    setCommissionRateAction: vi.fn(),
    exportPayoutsAction: vi.fn(),
}));
vi.mock("@/lib/commission-actions", () => actions);

const toast = vi.hoisted(() => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showUndo: vi.fn(),
    dismissToasts: vi.fn(),
}));
vi.mock("@saroh/ui/toast", () => toast);

const router = vi.hoisted(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({
    useRouter: () => router,
    usePathname: () => "/team/payouts",
    useSearchParams: () => new URLSearchParams(),
}));

import { EarningsCard } from "./earnings";
import { PayoutsTab } from "./payouts-tab";

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

/** A rate drawn for this run: never one written in the repository. */
const RATE = 1 + Math.floor(Math.random() * 4_999);

function row(over: Partial<PayoutRow> = {}): PayoutRow {
    return {
        platformAdminId: "pa_asha",
        name: "Asha Rao",
        onCommission: true,
        amountPaise: 12_345,
        lineCount: 1,
        status: "DUE",
        payout: null,
        waiting: { amountPaise: 0, lines: 0, held: 0, noRate: 0 },
        newBusinesses: [],
        lines: [
            {
                id: "line_1",
                organizationId: "org_1",
                businessName: "Green Leaf Gym",
                invoiceNumber: "SRH/26-27/00042",
                kind: "BROUGHT_IN",
                baseAmountPaise: 99_900,
                basisPoints: RATE,
                amountPaise: 12_345,
                periodEnd: "2026-12-20T00:00:00.000Z",
                status: "PAYABLE",
                statementMonth: "2026-12",
                installment: 1,
                installments: 1,
                note: null,
            },
        ],
        ...over,
    };
}

function statement(people: PayoutRow[]): PayoutStatement {
    return {
        month: "2026-12",
        current: true,
        totals: {
            duePaise: 12_345,
            paidPaise: 0,
            waitingPaise: 500,
            newBusinesses: 1,
        },
        people,
    };
}

const BROUGHT_IN_RATE: RateView = {
    id: "rate_1",
    kind: "BROUGHT_IN",
    basisPoints: RATE,
    effectiveFrom: "2026-10-19T00:00:00.000Z",
    setByName: "Mohit",
    reason: "first rates",
    createdAt: "2026-10-19T00:00:00.000Z",
};

const RATES: RatesView = {
    current: { BROUGHT_IN: BROUGHT_IN_RATE, ASSIGNED: null },
    upcoming: [],
    history: [],
};

describe("PayoutsTab", () => {
    it("shows each person's month: due, the payments, and what isn't payable yet", () => {
        render(
            <PayoutsTab
                statement={statement([
                    row({
                        waiting: {
                            amountPaise: 500,
                            lines: 2,
                            held: 1,
                            noRate: 0,
                        },
                    }),
                ])}
                canMarkPaid
                viewerPlatformAdminId="pa_billing"
            />,
        );
        expect(
            screen.getByRole("heading", { name: "December 2026" }),
        ).toBeTruthy();
        const card = screen.getByTestId("payout-pa_asha");
        expect(within(card).getByText("Asha Rao")).toBeTruthy();
        expect(within(card).getByText("Due")).toBeTruthy();
        expect(within(card).getByText(/₹123\.45 for 1 payment/)).toBeTruthy();
        expect(within(card).getByText(/2 payments \(1 held\)/)).toBeTruthy();
        expect(within(card).getByText("Green Leaf Gym")).toBeTruthy();
        // Month steps are addresses.
        expect(
            screen
                .getByRole("link", { name: "Previous month" })
                .getAttribute("href"),
        ).toBe("?month=2026-11");
        expect(
            screen
                .getByRole("link", { name: "Next month" })
                .getAttribute("href"),
        ).toBe("?month=2027-01");
    });

    it("marks a month paid with the payment's reference, then says so and refreshes", async () => {
        actions.markPayoutPaidAction.mockResolvedValue({
            ok: true,
            data: { payout: { id: "po_1" } },
        });
        render(
            <PayoutsTab
                statement={statement([row()])}
                canMarkPaid
                viewerPlatformAdminId="pa_billing"
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Mark paid…" }));
        const dialog = await screen.findByRole("dialog");
        fireEvent.change(within(dialog).getByLabelText("Payment reference"), {
            target: { value: "UTR-1234" },
        });
        fireEvent.change(within(dialog).getByLabelText(/Reason/), {
            target: { value: "Paid by bank transfer" },
        });
        fireEvent.click(
            within(dialog).getByRole("button", { name: "Mark paid" }),
        );
        await waitFor(() =>
            expect(actions.markPayoutPaidAction).toHaveBeenCalledWith(
                expect.objectContaining({
                    platformAdminId: "pa_asha",
                    month: "2026-12",
                    reference: "UTR-1234",
                    reason: "Paid by bank transfer",
                    idempotencyKey: expect.any(String) as unknown,
                }),
            ),
        );
        await waitFor(() => expect(toast.showSuccess).toHaveBeenCalled());
        expect(router.refresh).toHaveBeenCalled();
    });

    it("never lets someone mark their own commission paid", () => {
        render(
            <PayoutsTab
                statement={statement([row()])}
                canMarkPaid
                viewerPlatformAdminId="pa_asha"
            />,
        );
        const button = screen.getByRole("button", { name: "Mark paid…" });
        expect(button.hasAttribute("disabled")).toBe(true);
        expect(
            screen.getByText(
                "Someone else on the team marks your own commission paid.",
            ),
        ).toBeTruthy();
    });

    it("a paid month shows who paid and the reference, with no Mark paid", () => {
        render(
            <PayoutsTab
                statement={statement([
                    row({
                        status: "PAID",
                        payout: {
                            id: "po_1",
                            amountPaise: 12_345,
                            lineCount: 1,
                            reference: "UTR-9999",
                            paidAt: "2026-12-31T10:00:00.000Z",
                            paidByName: "Billing Person",
                        },
                    }),
                ])}
                canMarkPaid
                viewerPlatformAdminId="pa_billing"
            />,
        );
        expect(screen.getByText("Paid")).toBeTruthy();
        expect(screen.getByText("UTR-9999")).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Mark paid…" })).toBeNull();
    });

    it("lists the month's brought-in businesses with how each was proved", () => {
        render(
            <PayoutsTab
                statement={statement([
                    row({
                        newBusinesses: [
                            {
                                organizationId: "org_new",
                                name: "Lotus Salon",
                                source: "CODE",
                                startedAt: "2026-12-03T05:00:00.000Z",
                                evidence: { source: "CODE", code: "ABCD2345" },
                                ended: false,
                            },
                        ],
                    }),
                ])}
                canMarkPaid
                viewerPlatformAdminId={null}
            />,
        );
        expect(screen.getByText("Brought in this month (1)")).toBeTruthy();
        expect(
            screen
                .getByRole("link", { name: "Lotus Salon" })
                .getAttribute("href"),
        ).toBe("/businesses/org_new");
        expect(screen.getByText(/Owner typed their code/)).toBeTruthy();
        expect(screen.getByText(/Code: ABCD2345/)).toBeTruthy();
    });

    it("says so when nobody is paid by commission, and offers no export without team:pay", () => {
        render(
            <PayoutsTab
                statement={statement([])}
                canMarkPaid={false}
                viewerPlatformAdminId={null}
            />,
        );
        expect(
            screen.getByText("Nobody is paid by commission yet."),
        ).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Export CSV" })).toBeNull();
        expect(
            screen.queryByRole("button", { name: "Commission rates…" }),
        ).toBeNull();
    });

    it("exports the month's CSV", async () => {
        actions.exportPayoutsAction.mockResolvedValue({
            ok: true,
            data: {
                filename: "saroh-commission-2026-12.csv",
                csv: "Month\r\n",
            },
        });
        const createObjectURL = vi.fn(() => "blob:x");
        const revokeObjectURL = vi.fn();
        Object.assign(URL, { createObjectURL, revokeObjectURL });
        const click = vi
            .spyOn(HTMLAnchorElement.prototype, "click")
            .mockImplementation(() => undefined);
        render(
            <PayoutsTab
                statement={statement([row()])}
                canMarkPaid
                viewerPlatformAdminId={null}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
        await waitFor(() =>
            expect(actions.exportPayoutsAction).toHaveBeenCalledWith("2026-12"),
        );
        await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
        expect(click).toHaveBeenCalled();
        click.mockRestore();
    });
});

describe("RatesSheet, from the Payouts tab", () => {
    it("shows the rates in force and sets a new one as basis points", async () => {
        const next = RATE + 25;
        actions.setCommissionRateAction.mockResolvedValue({
            ok: true,
            data: {
                ...RATES,
                current: {
                    ...RATES.current,
                    ASSIGNED: {
                        ...BROUGHT_IN_RATE,
                        id: "rate_2",
                        kind: "ASSIGNED",
                        basisPoints: next,
                    },
                },
            },
        });
        render(
            <PayoutsTab
                statement={statement([row()])}
                canMarkPaid
                viewerPlatformAdminId={null}
                rates={RATES}
            />,
        );
        fireEvent.click(
            screen.getByRole("button", { name: "Commission rates…" }),
        );
        const sheet = await screen.findByRole("dialog", {
            name: "Commission rates",
        });
        expect(within(sheet).getByText("Not set")).toBeTruthy();

        fireEvent.click(
            within(sheet).getByRole("button", { name: "Set a rate…" }),
        );
        const dialog = await screen.findByRole("dialog", {
            name: "Set a commission rate?",
        });
        fireEvent.click(within(dialog).getByLabelText(/^Assigned/));
        const typed = `${Math.floor(next / 100)}.${String(next % 100).padStart(2, "0")}`;
        fireEvent.change(within(dialog).getByLabelText("Rate (%)"), {
            target: { value: typed },
        });
        fireEvent.change(within(dialog).getByLabelText(/Reason/), {
            target: { value: "assigned rate agreed" },
        });
        fireEvent.click(
            within(dialog).getByRole("button", { name: "Set rate" }),
        );
        await waitFor(() =>
            expect(actions.setCommissionRateAction).toHaveBeenCalledWith(
                expect.objectContaining({
                    kind: "ASSIGNED",
                    basisPoints: next,
                    reason: "assigned rate agreed",
                }),
            ),
        );
        await waitFor(() => expect(toast.showSuccess).toHaveBeenCalled());
    });

    it("refuses a percentage that isn't one, before asking the API", async () => {
        render(
            <PayoutsTab
                statement={statement([row()])}
                canMarkPaid
                viewerPlatformAdminId={null}
                rates={RATES}
            />,
        );
        fireEvent.click(
            screen.getByRole("button", { name: "Commission rates…" }),
        );
        const sheet = await screen.findByRole("dialog", {
            name: "Commission rates",
        });
        fireEvent.click(
            within(sheet).getByRole("button", { name: "Set a rate…" }),
        );
        const dialog = await screen.findByRole("dialog", {
            name: "Set a commission rate?",
        });
        fireEvent.click(within(dialog).getByLabelText(/^Brought in/));
        fireEvent.change(within(dialog).getByLabelText("Rate (%)"), {
            target: { value: "101" },
        });
        fireEvent.change(within(dialog).getByLabelText(/Reason/), {
            target: { value: "too much" },
        });
        fireEvent.click(
            within(dialog).getByRole("button", { name: "Set rate" }),
        );
        expect(
            await within(dialog).findByText(/Give a percentage from 0 to 100/),
        ).toBeTruthy();
        expect(actions.setCommissionRateAction).not.toHaveBeenCalled();
    });
});

describe("EarningsCard", () => {
    const earnings: EarningsSummary = {
        platformAdminId: "pa_asha",
        name: "Asha Rao",
        onCommission: true,
        totals: {
            pendingPaise: 1_000,
            held: 1,
            noRate: 2,
            duePaise: 2_000,
            paidPaise: 3_000,
        },
        months: [
            {
                month: "2026-12",
                amountPaise: 2_000,
                lines: 1,
                paid: false,
                reference: null,
            },
            {
                month: "2026-11",
                amountPaise: 3_000,
                lines: 2,
                paid: true,
                reference: "UTR-77",
            },
        ],
        recent: row().lines,
    };

    it("shows waiting, due and paid, each statement and the latest payments", () => {
        render(<EarningsCard earnings={earnings} />);
        expect(screen.getByText("₹10.00")).toBeTruthy();
        expect(screen.getByText("₹20.00", { selector: "dd" })).toBeTruthy();
        expect(screen.getByText("₹30.00", { selector: "dd" })).toBeTruthy();
        expect(screen.getByText(/1 held/)).toBeTruthy();
        expect(
            screen.getByText(/2 waiting for a commission rate/),
        ).toBeTruthy();
        expect(screen.getByText("December 2026")).toBeTruthy();
        expect(screen.getByText("UTR-77")).toBeTruthy();
        expect(screen.getByText("Green Leaf Gym")).toBeTruthy();
    });

    it("says when nothing has been earned yet", () => {
        render(
            <EarningsCard
                earnings={{
                    ...earnings,
                    months: [],
                    recent: [],
                    onCommission: false,
                }}
            />,
        );
        expect(screen.getByText("Nothing has been payable yet.")).toBeTruthy();
        expect(
            screen.getByText("None of their businesses has paid Saroh yet."),
        ).toBeTruthy();
        expect(screen.getByText("Not on commission")).toBeTruthy();
    });
});
