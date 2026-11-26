// @vitest-environment jsdom
/**
 * A subscription's quick look when its renewal isn't paid (findings 11,
 * 13, 21): "Not paid" unless a charge was declined, who to ring when the
 * read carries a phone, and Send new link and Record payment done here for
 * a role that may; Pause and Cancel still open the page.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OrgProvider } from "@/lib/query/org";
import type { Subscription } from "@/lib/subscriptions/service";
import { SubscriptionSaveProvider } from "@/lib/subscriptions/use-subscriptions";

import { SubscriptionQuickLook } from "./subscription-quick-look";

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({
    useRouter: () => router,
    usePathname: () => "/billing/subscriptions",
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@saroh/ui/toast", () => ({
    showError: vi.fn(),
    showSuccess: vi.fn(),
    showUndo: vi.fn(),
    dismissToast: vi.fn(),
    showToast: vi.fn(),
}));
vi.mock("@/lib/subscriptions/actions", () => ({}));
vi.mock("@/lib/gst-rates/actions", () => ({}));
const { newPayLink } = vi.hoisted(() => ({
    newPayLink: vi.fn<(...a: unknown[]) => Promise<unknown>>(),
}));
vi.mock("@/lib/invoices/link-actions", () => ({ newPayLink }));
vi.mock("@/components/invoices/payments/record-payment-sheet", () => ({
    RecordPaymentSheet: ({
        open,
        invoice,
    }: {
        open: boolean;
        invoice: { id: string };
    }) => (open ? <div data-recording={invoice.id} /> : null),
}));

const NOW = new Date("2026-11-26T04:30:00.000Z");

const unpaid = (over: Partial<Subscription> = {}): Subscription => ({
    id: "s1",
    status: "ACTIVE",
    plan: { id: "p1", name: "Monthly membership" },
    contact: {
        id: "c1",
        name: "Gurpreet Singh",
        email: "gurpreet@example.com",
        phone: "+919876543220",
    },
    price: "900.00",
    currency: "INR",
    interval: "MONTH",
    timezone: "Asia/Kolkata",
    currentPeriodStart: "2026-11-01T00:00:00.000Z",
    currentPeriodEnd: "2026-12-01T00:00:00.000Z",
    nextRenewalAt: "2026-11-30T18:30:00.000Z",
    startsAt: null,
    endsAt: null,
    pausedAt: null,
    pausedUntil: null,
    cancelledAt: null,
    overdue: true,
    overdueCount: 1,
    unpaidCount: 1,
    unpaidTotal: "900.00",
    oldestUnpaid: null,
    latestInvoice: null,
    paymentFailed: true,
    failedCharge: {
        id: "inv_412",
        number: "INV/26-27/0412",
        dueAt: "2026-11-08T18:29:59.999Z",
        total: "900.00",
    },
    collection: null,
    pendingPlan: null,
    startedAt: "2025-03-02T00:00:00.000Z",
    createdAt: "2025-03-02T00:00:00.000Z",
    ...over,
});

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.clearAllMocks();
});

function show(sub: Subscription, { canPayLink = true, canWrite = true } = {}) {
    act(() =>
        root.render(
            <QueryClientProvider client={new QueryClient()}>
                <OrgProvider orgId="org_1">
                    {/* Writes go as the tab's business (DEC-259). */}
                    <SubscriptionSaveProvider>
                        <SubscriptionQuickLook
                            sub={sub}
                            onClose={() => undefined}
                            plans={[]}
                            charges={{ state: "ok", data: {} }}
                            canWrite={canWrite}
                            canPayLink={canPayLink}
                            now={NOW}
                        />
                    </SubscriptionSaveProvider>
                </OrgProvider>
            </QueryClientProvider>,
        ),
    );
}

const page = () => document.body;
const button = (name: string) =>
    Array.from(page().querySelectorAll("button")).find(
        (b) => b.textContent === name,
    );
const links = () =>
    Array.from(page().querySelectorAll("a")).map((a) => a.textContent);

describe("a renewal that isn't paid", () => {
    it("says Not paid and how late, by the business's day", () => {
        show(unpaid());
        expect(page().textContent).toContain("Not paid");
        expect(page().textContent).not.toContain("Payment failed");
        expect(page().textContent).toContain(
            "Renewal of ₹900 isn't paid, 18 days late",
        );
    });

    it("says Payment failed once a charge was declined", () => {
        show(unpaid({ chargeFailed: true }));
        expect(page().textContent).toContain("Payment failed");
        expect(page().textContent).toContain("The charge was declined");
    });

    it("shows who to ring with a phone, and no card without one", () => {
        show(unpaid());
        const call = page().querySelector<HTMLAnchorElement>('a[href^="tel:"]');
        expect(call?.getAttribute("href")).toBe("tel:+919876543220");
        expect(call?.textContent).toContain("Call");

        show(
            unpaid({
                contact: {
                    id: "c1",
                    name: "Gurpreet Singh",
                    email: "gurpreet@example.com",
                    phone: null,
                },
            }),
        );
        expect(page().querySelector('a[href^="tel:"]')).toBeNull();
    });

    it("sends a new link and records a payment here, and leaves Pause and Cancel to the page", async () => {
        newPayLink.mockResolvedValue({
            ok: true,
            data: { url: "https://pay.example.com/l/abc" },
        });
        show(unpaid());
        expect(links()).not.toContain("Try again or fix payment");
        expect(links()).toEqual(
            expect.arrayContaining(["Pause instead", "Cancel"]),
        );

        await act(async () => {
            button("Send new link")?.click();
            await Promise.resolve();
        });
        expect(newPayLink).toHaveBeenCalledWith("inv_412", undefined, "org_1");
        expect(page().textContent).toContain("https://pay.example.com/l/abc");

        act(() => button("Record payment")?.click());
        expect(
            page().querySelector('[data-recording="inv_412"]'),
        ).not.toBeNull();
    });

    it("sends a role that can't write invoices to the page instead", () => {
        show(unpaid(), { canPayLink: false });
        expect(button("Send new link")).toBeUndefined();
        expect(button("Record payment")).toBeUndefined();
        expect(links()).toContain("Try again or fix payment");
    });
});
