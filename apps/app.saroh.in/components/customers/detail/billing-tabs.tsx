"use client";

import Link from "next/link";

import type {
    DetailInvoice,
    DetailSubscription,
} from "@/lib/customer-workspace/detail";
import type { Kind } from "@/lib/customer-workspace/view";
import { invoiceRow, subRow } from "@/lib/customer-workspace/view";

import { Empty, ROW_LINK, RowPill } from "./parts";

/**
 * Subscriptions (a shop) or Membership (a bookings business): each one
 * opens its Subscription Detail.
 */
export function SubscriptionsTab({
    rows,
    kind,
    timeZone,
    now,
}: {
    rows: DetailSubscription[];
    kind: Kind;
    timeZone: string;
    now: Date;
}) {
    if (!rows.length) {
        return (
            <Empty>
                {kind === "bookings"
                    ? "No membership. Add one from Payments › Subscriptions."
                    : "No subscriptions. Add one from Payments › Subscriptions."}
            </Empty>
        );
    }
    return (
        <div className="flex flex-col gap-2">
            {rows.map((s) => {
                const r = subRow(s, timeZone, now);
                return (
                    <Link
                        key={s.id}
                        href={`/billing/subscriptions/${s.id}`}
                        className={ROW_LINK}
                    >
                        <div className="min-w-0 flex-[2_1_200px]">
                            <div className="text-[14px] font-semibold">
                                {r.plan}
                            </div>
                            <div className="mt-0.5 text-[12px] text-muted-foreground">
                                {r.when}
                            </div>
                        </div>
                        <RowPill tone={r.tone}>{r.status}</RowPill>
                        <span className="font-semibold tabular-nums">
                            {r.price}
                        </span>
                        <span aria-hidden className="text-muted-foreground">
                            →
                        </span>
                    </Link>
                );
            })}
        </div>
    );
}

/**
 * Every invoice that is theirs — billed to them, and their linked orders'
 * own paper — with what is still owed on top. Each opens Invoice Detail.
 */
export function InvoicesTab({
    rows,
    owed,
    kind,
    timeZone,
    now,
}: {
    rows: DetailInvoice[];
    owed: string | null;
    kind: Kind;
    timeZone: string;
    now: Date;
}) {
    return (
        <>
            {owed ? (
                <div
                    role="status"
                    className="mb-2.5 rounded-xl border border-highlight bg-brand-subtle px-3.5 py-[11px] text-[13px] font-semibold text-brand-subtle-foreground"
                >
                    {owed}
                </div>
            ) : null}
            {!rows.length ? <Empty>No invoices yet.</Empty> : null}
            <div className="flex flex-col gap-2">
                {rows.map((v) => {
                    const r = invoiceRow(v, kind, timeZone, now);
                    return (
                        <Link
                            key={v.id}
                            href={`/billing/invoices/${v.id}`}
                            className={ROW_LINK}
                        >
                            <div className="min-w-0 flex-[1_1_120px]">
                                <div className="font-mono text-[12.5px]">
                                    {r.number}
                                </div>
                                <div className="mt-0.5 text-[12px] text-muted-foreground">
                                    {r.issued}
                                </div>
                            </div>
                            <div className="min-w-0 flex-[2_1_160px] text-[12.5px] text-muted-foreground">
                                {r.from}
                            </div>
                            <RowPill tone={r.tone}>{r.status}</RowPill>
                            <span className="min-w-[70px] text-right font-semibold tabular-nums">
                                {r.total}
                            </span>
                            <span aria-hidden className="text-muted-foreground">
                                →
                            </span>
                        </Link>
                    );
                })}
            </div>
        </>
    );
}
