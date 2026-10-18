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
    BillingActionRow,
    FailedBillingJob,
} from "@/lib/billing-action-words";

const actions = vi.hoisted(() => ({
    resolveBillingActionAction: vi.fn(),
    recheckRefundAction: vi.fn(),
    retryBillingJobAction: vi.fn(),
    endAutopayAction: vi.fn(),
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

import { ALL_CLEAR_TITLE, NeedsActionQueue } from "./needs-action-queue";

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

const rye = { id: "org_rye", name: "Rye & Co.", slug: "rye" };

function action(over: Partial<BillingActionRow> = {}): BillingActionRow {
    return {
        id: "act_1",
        organization: rye,
        code: "billing_refund_failed",
        refs: { payment: "pay_Abc123XYZ" },
        note: "Razorpay refused the refund of pay_Abc123XYZ. Refund it by hand.",
        createdAt: "2026-10-15T06:00:00Z",
        resolvedAt: null,
        resolvedBy: null,
        resolution: null,
        ...over,
    };
}

const job: FailedBillingJob = {
    id: "job_1",
    type: "billing.email",
    organization: rye,
    attempts: 5,
    maxAttempts: 5,
    lastError: "Mail provider timed out",
    failedAt: "2026-10-16T06:00:00Z",
};

function queue(props: Partial<ComponentProps<typeof NeedsActionQueue>> = {}) {
    return render(
        <NeedsActionQueue
            items={[action()]}
            failedJobs={[job]}
            canAct
            canRetry
            canOpenJobs
            {...props}
        />,
    );
}

describe("Needs action (R28)", () => {
    it("says what happened in one sentence, with the one fix and Mark resolved", () => {
        queue();
        const row = screen.getByRole("list", { name: "Needs action" });
        expect(within(row).getByText("Refund failed")).toBeTruthy();
        expect(
            within(row).getByText(
                "Razorpay couldn't send a refund back to the business.",
            ),
        ).toBeTruthy();
        const fix = within(row).getByRole("link", {
            name: "Refund it in Razorpay",
        });
        expect(fix.getAttribute("href")).toBe(
            "https://dashboard.razorpay.com/app/payments/pay_Abc123XYZ",
        );
        expect(fix.getAttribute("rel")).toBe("noopener noreferrer");
        expect(
            within(row).getByRole("button", { name: "Mark resolved" }),
        ).toBeTruthy();
        // What Saroh recorded is still there, under the sentence.
        expect(within(row).getByText(/Refund it by hand/)).toBeTruthy();
    });

    it("falls back to the subscription when the fix's id is missing", () => {
        queue({ items: [action({ refs: {} })] });
        expect(
            screen
                .getByRole("link", { name: "Open the subscription" })
                .getAttribute("href"),
        ).toBe("/billing/subscriptions?q=rye");
    });

    it("offers no write to an operator without saroh-billing:act", () => {
        queue({
            items: [action({ code: "billing_double_charge_refund_given_up" })],
            canAct: false,
        });
        expect(
            screen.queryByRole("button", { name: "Mark resolved" }),
        ).toBeNull();
        expect(
            screen.queryByRole("button", { name: "Check the refund again" }),
        ).toBeNull();
    });

    it("says a resolved row's resolution and offers nothing", () => {
        queue({
            items: [
                action({
                    resolvedAt: "2026-10-17T06:00:00Z",
                    resolution: "Refunded in Razorpay",
                }),
            ],
        });
        expect(screen.getByText(/Refunded in Razorpay/)).toBeTruthy();
        expect(
            screen.queryByRole("button", { name: "Mark resolved" }),
        ).toBeNull();
    });

    it("shows an all-clear when nothing is open", () => {
        queue({ items: [], failedJobs: [] });
        expect(screen.getByText(ALL_CLEAR_TITLE)).toBeTruthy();
        expect(screen.getByText("No billing job has failed.")).toBeTruthy();
    });

    it("shows the page's own empty card instead, for a search", () => {
        queue({ items: [], empty: <p>No billing problems match</p> });
        expect(screen.getByText("No billing problems match")).toBeTruthy();
        expect(screen.queryByText(ALL_CLEAR_TITLE)).toBeNull();
    });
});

describe("failed billing jobs: Retry in place (R28)", () => {
    it("runs the job again with a reason, and the row says so, highlighted", async () => {
        actions.retryBillingJobAction.mockResolvedValue({
            ok: true,
            data: { status: "PENDING", detail: null },
        });
        queue();
        const jobs = screen.getByRole("region", {
            name: "Failed billing jobs",
        });
        expect(
            within(jobs)
                .getByRole("link", { name: "Open in Jobs" })
                .getAttribute("href"),
        ).toBe("/operations/jobs?status=FAILED&type=billing.email");

        fireEvent.click(within(jobs).getByRole("button", { name: "Retry" }));
        const dialog = await screen.findByRole("dialog");
        fireEvent.change(within(dialog).getByRole("textbox"), {
            target: { value: "Mail provider is back" },
        });
        fireEvent.click(
            within(dialog).getByRole("button", { name: "Run it again" }),
        );

        await waitFor(() =>
            expect(within(jobs).getByRole("status").textContent).toBe(
                "Queued to run again",
            ),
        );
        expect(actions.retryBillingJobAction).toHaveBeenCalledWith(
            expect.objectContaining({
                jobId: "job_1",
                reason: "Mail provider is back",
            }),
        );
        // The row stays where it was, lit, and Retry is gone from it.
        const row = jobs.querySelector('[data-job-id="job_1"]');
        expect(row?.hasAttribute("data-just-changed")).toBe(true);
        expect(
            within(jobs).queryByRole("button", { name: "Retry" }),
        ).toBeNull();
        expect(toast.showSuccess).toHaveBeenCalledWith(
            "Send a billing email queued to run again.",
            expect.any(String),
        );
    });

    it("keeps the row as it was when the API wouldn't run it", async () => {
        actions.retryBillingJobAction.mockResolvedValue({
            ok: true,
            data: { status: "SKIPPED", detail: "Its business is suspended" },
        });
        queue();
        fireEvent.click(screen.getByRole("button", { name: "Retry" }));
        const dialog = await screen.findByRole("dialog");
        fireEvent.change(within(dialog).getByRole("textbox"), {
            target: { value: "Try once more" },
        });
        fireEvent.click(
            within(dialog).getByRole("button", { name: "Run it again" }),
        );
        expect(
            await within(dialog).findByText("Its business is suspended"),
        ).toBeTruthy();
        expect(toast.showSuccess).not.toHaveBeenCalled();
    });

    it("without jobs:retry, says who can, and offers no Retry", () => {
        queue({ canRetry: false, canOpenJobs: false });
        expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
        expect(screen.queryByRole("link", { name: "Open in Jobs" })).toBeNull();
        expect(
            screen.getByText(/ask Operations or a Platform Owner/),
        ).toBeTruthy();
    });
});
