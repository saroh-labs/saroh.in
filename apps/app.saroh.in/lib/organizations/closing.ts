import { formatMoney } from "@/lib/format/money";
import { membershipsWarning } from "@/lib/payments/memberships-warning";
import { providerName } from "@/lib/payments/providers";

/**
 * A business scheduled for deletion, as the workspace tells its people
 * (#921, owner 9 Oct). The API decides what is listed
 * (`GET /organizations/:org/closing`, `organizations/closing-notice.ts`);
 * this only words it. Client-safe: no server imports.
 */

export type ClosingRefundStage = "OWED" | "FAILED" | "SENDING" | "CONFIRMING";

export interface ClosingRefundRow {
    key: string;
    stage: ClosingRefundStage;
    amountMinor: number | null;
    currency: string | null;
    customer: string | null;
    paper: { label: string; href: string } | null;
    provider: string | null;
    providerRef: string | null;
}

export interface ClosingMembershipRow {
    subscriptionId: string;
    customer: string | null;
    plan: string;
    provider: string;
    href: string;
}

export interface ClosingView {
    closing: null | {
        deletesOn: string | null;
        refunds: {
            rows: ClosingRefundRow[];
            count: number;
            hidden: number;
        } | null;
        memberships: {
            byProvider: { provider: string; active: number }[];
            rows: ClosingMembershipRow[];
        } | null;
        /**
         * False when customers paid online and no payment provider is
         * connected now (DEC-120): Saroh can't send a refund. Absent from
         * an API before it, which reads as true.
         */
        refundsOnline?: boolean;
        /** The reader is an owner: offer "Download your data". */
        canDownloadData?: boolean;
    };
}

/** Settings › Your data, where the banner sends an owner. */
export const DATA_EXPORT_HREF = "/settings/data";

/**
 * What still works while the business winds down (owner, 9 Oct, DEC-120).
 * One sentence, the same for everyone; what a role may do is the API's.
 */
export const CLOSING_BODY =
    "Until then nothing new can start: no new orders, bookings, memberships, products or settings changes. You can still finish, cancel and refund what's already been made, and take payment for it. Its orders, invoices and customers are kept as records.";

/** Said when online refunds can't be sent from Saroh any more. */
export const CLOSING_REFUND_IN_DASHBOARD =
    "Your payment provider isn't connected, so Saroh can't send refunds online. Refund each customer in your provider's dashboard, then record it on the order.";

/** One refund's line, in the order a merchant reads it. */
export interface ClosingRefundLine {
    key: string;
    /** The order or invoice number, linked when it has one. */
    label: string;
    href: string | null;
    /** Who, how much, and where it stands, joined. */
    detail: string;
    /** What to search the provider's dashboard for. */
    reference: string | null;
}

export interface ClosingBannerWords {
    /** The date to say after the title ("… on 8 Nov"); null when it has passed. */
    deletesOn: string | null;
    title: string;
    body: string;
    refunds: {
        intro: string;
        lines: ClosingRefundLine[];
        /** Refunds on papers this reader can't open, said, not hidden. */
        more: string | null;
    } | null;
    memberships: {
        /** One warning per provider with active memberships. */
        warnings: string[];
        lines: { key: string; label: string; href: string }[];
    } | null;
    /** Refund in the provider's dashboard: its keys are gone (DEC-120). */
    refundInDashboard: string | null;
    /** "Download your data", for an owner. */
    data: { label: string; href: string } | null;
}

const STAGE: Record<ClosingRefundStage, string> = {
    OWED: "not refunded yet",
    FAILED: "the refund failed",
    SENDING: "being sent",
    CONFIRMING: "sent, not confirmed yet",
};

/**
 * The banner's words, or null when the business isn't closing. The refunds
 * intro is the owner's sentence, naming the one provider when every refund
 * is on the same one.
 */
export function closingBanner(
    view: ClosingView | null,
    now: Date = new Date(),
): ClosingBannerWords | null {
    const closing = view?.closing;
    if (!closing) return null;

    const refunds = closing.refunds;
    const shownRefunds =
        refunds && (refunds.rows.length > 0 || refunds.hidden > 0)
            ? {
                  intro: `These refunds haven't gone back to your customers yet. Finish each one, and check it in your ${dashboardOf(refunds.rows.map((r) => r.provider))} dashboard.`,
                  lines: refunds.rows.map(refundLine),
                  more:
                      refunds.hidden > 0
                          ? `${refunds.rows.length > 0 ? "And " : ""}${refunds.hidden} ${refunds.hidden === 1 ? "refund" : "refunds"} on orders or invoices an owner or admin can see.`
                          : null,
              }
            : null;

    const memberships = closing.memberships;
    const active = memberships?.byProvider.filter((p) => p.active > 0) ?? [];
    const shownMemberships =
        memberships && active.length > 0
            ? {
                  warnings: active.map((p) =>
                      membershipsWarning(
                          p.provider,
                          p.active,
                          "Deleting the business",
                      ),
                  ),
                  lines: memberships.rows.map((m) => ({
                      key: m.subscriptionId,
                      label: [m.customer ?? "A customer", m.plan].join(" · "),
                      href: m.href,
                  })),
              }
            : null;

    // Past its date, a deletion waits for the refunds (the sweep keeps it).
    const due =
        closing.deletesOn !== null &&
        Date.parse(closing.deletesOn) <= now.getTime();
    const owesRefunds = (refunds?.count ?? 0) > 0;
    return {
        deletesOn: due ? null : closing.deletesOn,
        title: !due
            ? "This business will be deleted"
            : owesRefunds
              ? "This business will be deleted once its customers' refunds are finished"
              : "This business is being deleted",
        body: CLOSING_BODY,
        refunds: shownRefunds,
        memberships: shownMemberships,
        refundInDashboard:
            closing.refundsOnline === false
                ? CLOSING_REFUND_IN_DASHBOARD
                : null,
        data: closing.canDownloadData
            ? { label: "Download your data", href: DATA_EXPORT_HREF }
            : null,
    };
}

function refundLine(r: ClosingRefundRow): ClosingRefundLine {
    const amount = formatMoney(r.amountMinor, r.currency);
    return {
        key: r.key,
        label: r.paper?.label ?? "A refund",
        href: r.paper?.href ?? null,
        detail: [r.customer, amount, STAGE[r.stage]]
            .filter((part): part is string => Boolean(part))
            .join(" · "),
        reference: r.providerRef,
    };
}

/** "Razorpay" when every refund is on Razorpay, else the general words. */
function dashboardOf(providers: (string | null)[]): string {
    const known = providers
        .filter((p): p is string => !!p)
        .filter((p, i, all) => all.indexOf(p) === i);
    return known.length === 1 ? providerName(known[0]) : "payment provider's";
}
