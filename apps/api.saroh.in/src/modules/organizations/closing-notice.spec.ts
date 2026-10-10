jest.mock("@saroh/database", () => ({
    prisma: {
        organization: { findUnique: jest.fn() },
        merchantPaymentProvider: { findFirst: jest.fn() },
        paymentIntent: { findFirst: jest.fn() },
    },
}));
jest.mock("../payments/refunds-outstanding", () => ({
    refundsOutstanding: jest.fn(),
}));
jest.mock("../payments/provider-memberships", () => ({
    activeMemberships: jest.fn(),
}));

import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { activeMemberships } from "../payments/provider-memberships";
import type { OutstandingRefund } from "../payments/refunds-outstanding";
import { refundsOutstanding } from "../payments/refunds-outstanding";
import { closingNotice, visibleRefunds } from "./closing-notice";

const SINCE = new Date("2026-10-01T00:00:00.000Z");

const refund = (
    key: string,
    href: string | null,
    extra: Partial<OutstandingRefund> = {},
): OutstandingRefund => ({
    key,
    stage: "OWED",
    amountCents: 10_000,
    currency: "INR",
    customer: "Asha Rao",
    paper: href ? { label: key, href } : null,
    provider: "RAZORPAY",
    providerRef: "pay_1",
    since: SINCE,
    ...extra,
});

const ROWS = [
    refund("#1042", "/commerce/orders/ord_1"),
    refund("INV-7", "/billing/invoices/inv_7"),
    refund("Autopay check", "/billing/subscriptions"),
];

const ctx = (role: OrganizationContext["role"]): OrganizationContext =>
    ({ organizationId: "org_1", userId: "u1", role }) as OrganizationContext;

describe("visibleRefunds (#921)", () => {
    it("shows an order's refund to order readers and the rest to invoice readers", () => {
        const orders = visibleRefunds(ROWS, {
            readsOrders: true,
            readsInvoices: false,
        });
        expect(orders.rows.map((r) => r.key)).toEqual(["#1042"]);
        expect(orders).toMatchObject({ count: 3, hidden: 2 });

        const invoices = visibleRefunds(ROWS, {
            readsOrders: false,
            readsInvoices: true,
        });
        expect(invoices.rows.map((r) => r.key)).toEqual([
            "INV-7",
            "Autopay check",
        ]);
    });

    it("carries what the merchant finds it by: the paper and the provider reference", () => {
        const { rows } = visibleRefunds(ROWS, {
            readsOrders: true,
            readsInvoices: true,
        });
        expect(rows[0]).toEqual({
            key: "#1042",
            stage: "OWED",
            amountMinor: 10_000,
            currency: "INR",
            customer: "Asha Rao",
            paper: { label: "#1042", href: "/commerce/orders/ord_1" },
            provider: "RAZORPAY",
            providerRef: "pay_1",
        });
    });
});

describe("closingNotice (#921)", () => {
    const provider = prisma.merchantPaymentProvider.findFirst as jest.Mock;
    const paidOnline = prisma.paymentIntent.findFirst as jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        provider.mockResolvedValue({ id: "mpp_1" });
        paidOnline.mockResolvedValue(null);
    });

    it("says nothing for a business that isn't closing", async () => {
        (prisma.organization.findUnique as jest.Mock).mockResolvedValue({
            lifecycleStatus: "ACTIVE",
            deletionScheduledAt: null,
        });
        expect(await closingNotice(ctx("OWNER"))).toEqual({ closing: null });
        expect(refundsOutstanding).not.toHaveBeenCalled();
    });

    it("lists the refunds and the memberships to an owner", async () => {
        const on = new Date("2026-11-08T00:00:00.000Z");
        (prisma.organization.findUnique as jest.Mock).mockResolvedValue({
            lifecycleStatus: "PENDING_DELETION",
            deletionScheduledAt: on,
        });
        (refundsOutstanding as jest.Mock).mockResolvedValue({
            count: 3,
            rows: ROWS,
        });
        (activeMemberships as jest.Mock).mockResolvedValue({
            byProvider: [{ provider: "RAZORPAY", active: 1 }],
            rows: [
                {
                    subscriptionId: "sub_1",
                    customer: "Ravi",
                    plan: "Monthly yoga",
                    provider: "RAZORPAY",
                },
            ],
        });
        const view = await closingNotice(ctx("OWNER"));
        expect(view.closing?.deletesOn).toBe(on.toISOString());
        expect(view.closing?.refunds).toMatchObject({ count: 3, hidden: 0 });
        expect(view.closing?.memberships?.rows[0]).toMatchObject({
            href: "/billing/subscriptions/sub_1",
        });
        // DEC-120: keys connected, so refunds still go online; and an
        // owner is offered their data.
        expect(view.closing).toMatchObject({
            refundsOnline: true,
            canDownloadData: true,
        });
    });

    it("says online refunds are off once the keys are gone, only where customers paid online (DEC-120)", async () => {
        (prisma.organization.findUnique as jest.Mock).mockResolvedValue({
            lifecycleStatus: "PENDING_DELETION",
            deletionScheduledAt: SINCE,
        });
        provider.mockResolvedValue(null);
        paidOnline.mockResolvedValue({ id: "pi_1" });
        expect((await closingNotice(ctx("MEMBER"))).closing).toMatchObject({
            refundsOnline: false,
            canDownloadData: false,
        });
        // Nobody ever paid online: nothing to refund that way.
        paidOnline.mockResolvedValue(null);
        expect((await closingNotice(ctx("ADMIN"))).closing?.refundsOnline).toBe(
            true,
        );
    });

    it("gives a member, who sees no money, the date alone", async () => {
        (prisma.organization.findUnique as jest.Mock).mockResolvedValue({
            lifecycleStatus: "PENDING_DELETION",
            deletionScheduledAt: SINCE,
        });
        const view = await closingNotice(ctx("MEMBER"));
        expect(view.closing).toEqual({
            deletesOn: SINCE.toISOString(),
            refunds: null,
            memberships: null,
            refundsOnline: true,
            canDownloadData: false,
        });
        expect(refundsOutstanding).not.toHaveBeenCalled();
        expect(activeMemberships).not.toHaveBeenCalled();
    });
});
