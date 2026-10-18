/** @vitest-environment jsdom */
import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
    BillingHistoryPage,
    BillingHistoryRow,
} from "@/lib/subscription-sheet";
import { failedCharges, problemOf } from "@/lib/subscription-sheet";
import { invoiceRow, subscriptionDetail } from "@/test/subscription-fixture";

const actions = vi.hoisted(() => ({
    resolveBillingActionAction: vi.fn(),
    endAutopayAction: vi.fn(),
    recheckRefundAction: vi.fn(),
    syncCustomerAction: vi.fn(),
    recordRefundAction: vi.fn(),
}));
vi.mock("@/lib/billing-actions", () => actions);

const toast = vi.hoisted(() => ({
    showUndo: vi.fn(),
    showSuccess: vi.fn(),
    showError: vi.fn(),
    dismissToasts: vi.fn(),
}));
vi.mock("@saroh/ui/toast", () => toast);

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { SubscriptionChangesProvider } from "./subscription-changes";
import { SubscriptionSheet } from "./subscription-sheet";

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

const BASE = "/billing/subscriptions";

function sheet(props: Partial<ComponentProps<typeof SubscriptionSheet>> = {}) {
    return render(
        <SubscriptionChangesProvider>
            <SubscriptionSheet
                detail={subscriptionDetail()}
                base={BASE}
                query={{ open: "sub_row", q: "rye" }}
                canAct
                {...props}
            />
        </SubscriptionChangesProvider>,
    );
}

function historyPage(
    items: BillingHistoryPage["items"],
    rest: Partial<BillingHistoryPage> = {},
): BillingHistoryPage {
    return {
        items,
        page: 1,
        limit: 50,
        hasMore: false,
        show: "everything",
        ...rest,
    };
}

describe("SubscriptionSheet › header and the problem banner", () => {
    it("names the business, its status and 'plan · cycle · since', with a Close", () => {
        sheet();
        expect(
            screen.getByRole("heading", { name: "Rye and Co" }),
        ).toBeTruthy();
        expect(screen.getByText("Active")).toBeTruthy();
        expect(
            screen.getByText("Plan X · Monthly · since 2 Mar 2026"),
        ).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Close" }));
        expect(router.push).toHaveBeenCalledWith(`${BASE}?q=rye`, {
            scroll: false,
        });
    });

    it("past due: the payment-failed banner, its tries and last try, and no fix (no pay link this round)", () => {
        sheet({
            detail: subscriptionDetail({
                subscription: { status: "PAST_DUE" },
                events: [
                    event("subscription.pending", "2026-10-19T04:00:00Z"),
                    event("subscription.pending", "2026-10-17T04:00:00Z"),
                    event("subscription.charged", "2026-09-14T04:00:00Z"),
                    event("subscription.pending", "2026-09-12T04:00:00Z"),
                ],
            }),
        });
        const banner = screen.getByRole("alert");
        expect(within(banner).getByText("Payment failed")).toBeTruthy();
        expect(banner.textContent).toContain("A charge failed 2 times.");
        expect(banner.textContent).toContain("Last try 19 Oct 2026.");
        expect(banner.textContent).toContain(
            "they drop to Free and keep their data",
        );
        expect(within(banner).queryByRole("button")).toBeNull();
    });

    it("no banner when nothing is wrong", () => {
        sheet();
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("a double charge owed: the banner offers Check the refund again", () => {
        sheet({
            detail: subscriptionDetail({
                doubleCharges: [
                    {
                        providerPaymentId: "pay_Twice1234",
                        provider: "RAZORPAY",
                        amountPaise: 11_800,
                        reason: "Charged twice",
                        claimedAt: "2026-10-10T00:00:00Z",
                        refundedAt: null,
                        providerRefundId: null,
                    },
                ],
            }),
        });
        const banner = screen.getByRole("alert");
        expect(
            within(banner).getByRole("button", {
                name: "Check the refund again",
            }),
        ).toBeTruthy();
    });

    it("one problem at a time, the failed payment first", () => {
        const profile = subscriptionDetail().billingProfile;
        if (!profile) throw new Error("the fixture has a profile");
        const problem = problemOf(
            subscriptionDetail({
                subscription: { status: "PAST_DUE" },
                billingProfile: {
                    ...profile,
                    lastError: "refused",
                },
            }),
        );
        expect(problem?.title).toBe("Payment failed");
        expect(failedCharges([]).failures).toBe(0);
    });
});

describe("SubscriptionSheet › Summary", () => {
    it("shows the facts: plan, price, paid until, autopay, profile, billing email, ids", () => {
        sheet({
            detail: subscriptionDetail({
                price: {
                    listPaise: 12_300,
                    currency: "INR",
                    customPaise: 4_500,
                    customUntil: "2026-12-31T00:00:00Z",
                },
            }),
        });
        const text = document.body.textContent;
        expect(text).toMatch(/₹45(\.00)? a month, custom until 31 Dec 2026/);
        expect(text).toContain("Plan X · Monthly · version 2");
        expect(text).toContain("14 Nov 2026");
        expect(text).toContain("On · runs out 14 Oct 2027");
        expect(text).toContain("Rye and Co Pvt");
        expect(text).toContain("accounts@example.com");
        expect(screen.getByRole("link", { name: "sub_Rye12345" })).toBeTruthy();
        expect(
            screen.getByRole("link", { name: "cust_Rye12345" }),
        ).toBeTruthy();
    });

    it("copies each Razorpay id", async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, "clipboard", {
            value: { writeText },
            configurable: true,
        });
        sheet();
        fireEvent.click(
            screen.getByRole("button", { name: "Copy the subscription id" }),
        );
        await waitFor(() =>
            expect(writeText).toHaveBeenCalledWith("sub_Rye12345"),
        );
        fireEvent.click(
            screen.getByRole("button", { name: "Copy the customer id" }),
        );
        await waitFor(() =>
            expect(writeText).toHaveBeenCalledWith("cust_Rye12345"),
        );
    });

    it("offers today's four actions only: no pay link, no more time", () => {
        sheet({ detail: subscriptionDetail({ invoices: [invoiceRow(1)] }) });
        for (const title of [
            "End autopay",
            "Sync the customer",
            "Record a refund made by hand",
            "Re-check a refund",
        ]) {
            expect(screen.getByRole("heading", { name: title })).toBeTruthy();
        }
        expect(
            screen.getByRole("button", { name: "End autopay" }),
        ).toBeTruthy();
        expect(screen.getByRole("button", { name: "Sync again" })).toBeTruthy();
        expect(
            screen.getByRole("button", { name: "Record a refund" }),
        ).toBeTruthy();
        expect(screen.getByText("No refund is waiting.")).toBeTruthy();
        expect(
            screen.queryByRole("button", { name: /pay link|more time/i }),
        ).toBeNull();
        expect(document.body.textContent).not.toMatch(/pay link|more time/i);
        expect(document.body.textContent).toContain(
            "Every action asks for a reason and goes in the audit trail. Refunds are made in Razorpay.",
        );
    });

    it("a reader sees the facts and no action", () => {
        sheet({ canAct: false });
        expect(
            screen.queryByRole("button", { name: "End autopay" }),
        ).toBeNull();
        expect(document.body.textContent).toContain(
            "Your access lets you read Saroh's billing, not change it.",
        );
    });

    it("End autopay keeps the paid period and the reason requirement, then says so and lights the row", async () => {
        actions.endAutopayAction.mockResolvedValue({
            ok: true,
            data: { ok: true, changed: true, effectiveAt: null },
        });
        sheet();
        fireEvent.click(screen.getByRole("button", { name: "End autopay" }));
        const dialog = await screen.findByRole("dialog", {
            name: "End Rye and Co's autopay",
        });
        expect(dialog.textContent).toContain(
            "keeps Plan X to the end of what it has paid for (14 Nov 2026), then moves to Free",
        );
        const submit = within(dialog).getByRole("button", {
            name: "End autopay",
        });
        expect(submit).toHaveProperty("disabled", true);
        fireEvent.change(within(dialog).getByLabelText(/Type .* to confirm/), {
            target: { value: "Rye and Co" },
        });
        expect(submit).toHaveProperty("disabled", true);
        fireEvent.change(within(dialog).getByLabelText(/Reason/), {
            target: { value: "no" },
        });
        expect(submit).toHaveProperty("disabled", true);
        fireEvent.change(within(dialog).getByLabelText(/Reason/), {
            target: { value: "Owner asked by phone" },
        });
        expect(submit).toHaveProperty("disabled", false);
        fireEvent.click(submit);
        await waitFor(() =>
            expect(actions.endAutopayAction).toHaveBeenCalledWith(
                expect.objectContaining({
                    subscriptionId: "sub_row",
                    reason: "Owner asked by phone",
                }),
            ),
        );
        await waitFor(() =>
            expect(toast.showSuccess).toHaveBeenCalledWith(
                "Rye and Co's autopay ended. They keep Plan X to 14 Nov 2026.",
                expect.any(String),
            ),
        );
    });
});

describe("SubscriptionSheet › tabs", () => {
    it("each tab is an address that keeps the list's place", () => {
        sheet();
        const history = screen.getByRole("link", { name: "History" });
        expect(history.getAttribute("href")).toBe(
            `${BASE}?open=sub_row&q=rye&sheet=history`,
        );
        const summary = screen.getByRole("link", { name: "Summary" });
        expect(summary.getAttribute("aria-current")).toBe("page");
    });

    it("Invoices lists the invoices with their PDF", () => {
        sheet({
            tab: "invoices",
            detail: subscriptionDetail({ invoices: [invoiceRow(7)] }),
        });
        const pdf = screen.getByRole("link", {
            name: "Download invoice SAR/TEST/7 as a PDF",
        });
        expect(pdf.getAttribute("href")).toBe("/billing/invoices/inv_7/pdf");
    });
});

describe("SubscriptionSheet › History", () => {
    const staffRow: BillingHistoryRow = {
        id: "audit:1",
        at: "2026-10-19T06:00:00.000Z",
        kind: "staff",
        title: "Autopay ended by staff",
        line: "Asha: Owner asked by phone",
        refs: { action: "billing.autopay.ended" },
    };
    const providerRow: BillingHistoryRow = {
        id: "provider:1",
        at: "2026-10-18T06:00:00.000Z",
        kind: "provider",
        title: "A charge failed; Razorpay will try again",
        line: "Saroh applied it.",
        refs: {
            provider: "RAZORPAY",
            type: "subscription.pending",
            event: "evt_Abc12345",
        },
    };
    const rows = [staffRow, providerRow];

    it("draws the timeline: time, title, tag and line; a provider event adds what Razorpay sent", () => {
        sheet({ tab: "history", history: historyPage(rows) });
        const items = screen.getAllByRole("listitem");
        expect(items[0]?.textContent).toContain("Autopay ended by staff");
        expect(items[0]?.textContent).toContain("Staff");
        expect(items[0]?.textContent).toContain("Asha: Owner asked by phone");
        expect(items[0]?.textContent).not.toContain("billing.autopay.ended");
        expect(items[1]?.textContent).toContain("What Razorpay sent");
        expect(items[1]?.textContent).toContain("subscription.pending");
        expect(items[1]?.textContent).toContain("evt_Abc12345");
        expect(items[1]?.textContent).toContain("Razorpay");
    });

    it("the chips are addresses, the one on marked", () => {
        sheet({
            tab: "history",
            historyShow: "provider",
            history: historyPage([providerRow], { show: "provider" }),
        });
        const group = screen.getByRole("group", { name: "Show" });
        const chips = within(group).getAllByRole("link");
        expect(chips.map((c) => c.textContent)).toEqual([
            "Everything",
            "Provider events",
            "Invoices",
            "Saroh and staff",
        ]);
        expect(
            within(group)
                .getByRole("link", { name: "Provider events" })
                .getAttribute("aria-current"),
        ).toBe("true");
        expect(
            within(group)
                .getByRole("link", { name: "Saroh and staff" })
                .getAttribute("href"),
        ).toBe(`${BASE}?open=sub_row&q=rye&sheet=history&history=saroh`);
        expect(
            within(group)
                .getByRole("link", { name: "Everything" })
                .getAttribute("href"),
        ).toBe(`${BASE}?open=sub_row&q=rye&sheet=history`);
    });

    it("pages with Older and Newer", () => {
        sheet({
            tab: "history",
            history: historyPage(rows, { page: 2, hasMore: true }),
        });
        expect(
            screen.getByRole("link", { name: "Older" }).getAttribute("href"),
        ).toBe(`${BASE}?open=sub_row&q=rye&sheet=history&hpage=3`);
        expect(
            screen.getByRole("link", { name: "Newer" }).getAttribute("href"),
        ).toBe(`${BASE}?open=sub_row&q=rye&sheet=history`);
    });

    it("an empty history says nothing has happened yet", () => {
        sheet({ tab: "history", history: historyPage([]) });
        expect(screen.getByText("Nothing has happened yet")).toBeTruthy();
    });

    it("a chip that leaves nothing offers the way back", () => {
        sheet({
            tab: "history",
            historyShow: "invoices",
            history: historyPage([], { show: "invoices" }),
        });
        expect(screen.queryByText("Nothing has happened yet")).toBeNull();
        expect(
            screen
                .getByRole("link", { name: /clear filters/i })
                .getAttribute("href"),
        ).toBe(`${BASE}?open=sub_row&q=rye&sheet=history`);
    });

    it("a history that couldn't be read says so, not empty", () => {
        sheet({ tab: "history", history: undefined });
        expect(screen.queryByText("Nothing has happened yet")).toBeNull();
        expect(document.body.textContent).toContain("Couldn't load");
    });
});

function event(type: string, receivedAt: string) {
    return {
        id: `${type}-${receivedAt}`,
        provider: "RAZORPAY",
        providerEventId: `evt_${receivedAt}`,
        type,
        receivedAt,
        processedAt: receivedAt,
    };
}
