import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { activeMemberships } from "../payments/provider-memberships";
import type {
    OutstandingRefund,
    OutstandingRefundStage,
} from "../payments/refunds-outstanding";
import { refundsOutstanding } from "../payments/refunds-outstanding";
import { OrganizationLifecycleStatus } from "./organization-lifecycle.policy";
import { allows } from "./organization-policy";

/** A refund not yet back with its customer, as the workspace lists it. */
export interface ClosingRefundRow {
    key: string;
    stage: OutstandingRefundStage;
    amountMinor: number | null;
    currency: string | null;
    customer: string | null;
    /** Its order or invoice in the workspace; null when it has none. */
    paper: { label: string; href: string } | null;
    provider: string | null;
    /** What to find it by in the provider's dashboard. */
    providerRef: string | null;
}

export interface ClosingMembershipRow {
    subscriptionId: string;
    customer: string | null;
    plan: string;
    provider: string;
    href: string;
}

/**
 * `GET /organizations/:org/closing` (#921, owner 9 Oct): what a business
 * scheduled for deletion should finish while it still can. `closing` is
 * null for any other state, so the workspace shows nothing.
 */
export interface ClosingNoticeView {
    closing: null | {
        /** When the window ends and the business is deleted. */
        deletesOn: string | null;
        /**
         * Refunds not yet back with its customers. Null when the reader may
         * see no money at all; `hidden` counts the rows on papers they
         * can't open (an order needs `order:read`, the rest `invoice:read`).
         */
        refunds: {
            rows: ClosingRefundRow[];
            count: number;
            hidden: number;
        } | null;
        /**
         * Customers' autopay memberships active at a provider: deletion
         * cancels none of them there. Null unless `subscription:read`.
         */
        memberships: {
            byProvider: { provider: string; active: number }[];
            rows: ClosingMembershipRow[];
        } | null;
    };
}

/** Build the notice for this reader. Reads only. */
export async function closingNotice(
    ctx: OrganizationContext,
): Promise<ClosingNoticeView> {
    const organization = await prisma.organization.findUnique({
        where: { id: ctx.organizationId },
        select: { lifecycleStatus: true, deletionScheduledAt: true },
    });
    if (
        organization?.lifecycleStatus !==
        OrganizationLifecycleStatus.PendingDeletion
    ) {
        return { closing: null };
    }

    const readsOrders = allows(ctx, "order:read");
    const readsInvoices = allows(ctx, "invoice:read");
    const readsMemberships = allows(ctx, "subscription:read");

    const [owed, memberships] = await Promise.all([
        readsOrders || readsInvoices
            ? refundsOutstanding(prisma, ctx.organizationId)
            : null,
        readsMemberships ? activeMemberships(prisma, ctx.organizationId) : null,
    ]);

    return {
        closing: {
            deletesOn: organization.deletionScheduledAt?.toISOString() ?? null,
            refunds: owed
                ? visibleRefunds(owed.rows, { readsOrders, readsInvoices })
                : null,
            memberships: memberships
                ? {
                      byProvider: memberships.byProvider,
                      rows: memberships.rows.map((m) => ({
                          ...m,
                          href: `/billing/subscriptions/${m.subscriptionId}`,
                      })),
                  }
                : null,
        },
    };
}

/** The rows on papers this reader may open, and how many are left out. */
export function visibleRefunds(
    rows: OutstandingRefund[],
    can: { readsOrders: boolean; readsInvoices: boolean },
): { rows: ClosingRefundRow[]; count: number; hidden: number } {
    const shown = rows.filter((r) =>
        r.paper?.href.startsWith("/commerce/orders/")
            ? can.readsOrders
            : can.readsInvoices,
    );
    return {
        rows: shown.map((r) => ({
            key: r.key,
            stage: r.stage,
            amountMinor: r.amountCents,
            currency: r.currency,
            customer: r.customer,
            paper: r.paper,
            provider: r.provider,
            providerRef: r.providerRef,
        })),
        count: rows.length,
        hidden: rows.length - shown.length,
    };
}
