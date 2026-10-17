"use client";

import { Badge } from "@saroh/ui/badge";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@saroh/ui/sheet";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import type { SarohSubscriptionDetail } from "@/lib/billing-words";
import {
    checkoutKindLabel,
    checkoutStatusLabel,
    cycleLabel,
    endingLine,
    formatPaise,
    istDate,
    istDateTime,
    statusLabel,
} from "@/lib/billing-words";

import { STATUS_TONE } from "./subscription-table";

/**
 * One subscription, read-first in a side sheet (DEC-163): its plan and
 * provider ids, its checkouts and what the billing provider sent, newest
 * first, so an operator can see "Razorpay sent subscription.cancelled at
 * …". Read-only. Closing it goes back to the list with its filters.
 */
export function SubscriptionSheet({
    detail,
    failed,
    closeHref,
}: {
    /** Null when the read failed or was refused (`failed` says which). */
    detail: SarohSubscriptionDetail | null;
    failed?: "error" | "refused";
    closeHref: string;
}) {
    const router = useRouter();
    const sub = detail?.subscription;

    return (
        <Sheet
            open
            onOpenChange={(open) => {
                if (!open) router.push(closeHref, { scroll: false });
            }}
        >
            <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
                <SheetHeader>
                    <SheetTitle>
                        {sub ? sub.organization.name : "Subscription"}
                    </SheetTitle>
                    <SheetDescription>
                        {sub
                            ? `${sub.plan.name} · ${cycleLabel(sub.billingCycle)} · version ${sub.plan.version}`
                            : failed === "refused"
                              ? "Your access does not cover Saroh's subscriptions."
                              : "It could not be loaded. Nothing has changed; try again in a moment."}
                    </SheetDescription>
                </SheetHeader>

                {detail ? <SheetBody detail={detail} /> : null}
            </SheetContent>
        </Sheet>
    );
}

function SheetBody({ detail }: { detail: SarohSubscriptionDetail }) {
    const sub = detail.subscription;
    return (
        <div className="mt-5 grid gap-6 text-sm">
            <div className="flex flex-wrap items-center gap-2">
                <Badge variant={STATUS_TONE[sub.status] ?? "neutral"}>
                    {statusLabel(sub.status)}
                </Badge>
                <Link
                    href={`/businesses/${sub.organization.id}`}
                    className="underline underline-offset-4"
                >
                    Open the business
                </Link>
            </div>

            <Facts
                rows={[
                    ["Paid until", istDate(sub.currentPeriodEnd)],
                    [
                        "Coming up",
                        endingLine(sub) ??
                            (sub.status === "CANCELLED"
                                ? "Nothing: this plan has ended"
                                : sub.provider
                                  ? "Renews as it is"
                                  : "Stays on this plan"),
                    ],
                    [
                        "Owner chose Free on",
                        sub.freeChosenAt ? istDate(sub.freeChosenAt) : null,
                    ],
                    [
                        sub.termPayment === "ONE_TIME"
                            ? "Year paid until"
                            : "Autopay runs out",
                        sub.termEndsAt ? istDate(sub.termEndsAt) : null,
                    ],
                    ["Provider", sub.provider ?? "None (free plan)"],
                    ["Provider subscription", mono(sub.providerSubscriptionId)],
                    ["Provider customer", mono(sub.providerCustomerId)],
                    [
                        "Last invoice",
                        sub.lastInvoice
                            ? `${sub.lastInvoice.number} · ${istDate(sub.lastInvoice.issuedAt)} · ${formatPaise(sub.lastInvoice.totalPaise)}`
                            : "None yet",
                    ],
                ]}
            />

            <section className="grid gap-2">
                <h3 className="font-medium">Checkouts</h3>
                {detail.checkouts.length === 0 ? (
                    <p className="text-muted-foreground">
                        No checkout yet: this business has never started paying
                        for a plan.
                    </p>
                ) : (
                    <ul className="grid gap-2">
                        {detail.checkouts.map((c) => (
                            <li
                                key={c.id}
                                className="grid gap-1 rounded-lg border p-3"
                            >
                                <p className="font-medium">
                                    {checkoutKindLabel(c.kind)} · {c.planName} ·{" "}
                                    {cycleLabel(c.cycle)}
                                </p>
                                <p className="text-muted-foreground">
                                    {checkoutStatusLabel(c.status)} · started{" "}
                                    {istDateTime(c.createdAt)}
                                    {c.completedAt
                                        ? ` · done ${istDateTime(c.completedAt)}`
                                        : ""}
                                </p>
                                <p className="text-muted-foreground">
                                    {formatPaise(c.pricePaise)} before GST
                                    {c.chargeNowPaise > 0
                                        ? ` · ${formatPaise(c.chargeNowPaise)} charged at once`
                                        : ""}
                                    {c.startAt
                                        ? ` · charges from ${istDate(c.startAt)}`
                                        : ""}
                                </p>
                                {c.endedReason ? (
                                    <p className="text-muted-foreground">
                                        Ended: {c.endedReason}
                                    </p>
                                ) : null}
                                <p className="break-all font-mono text-[12px] text-muted-foreground">
                                    {c.provider} · {c.providerSubscriptionId}
                                </p>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section className="grid gap-2">
                <h3 className="font-medium">What the billing provider sent</h3>
                {detail.events.length === 0 ? (
                    <p className="text-muted-foreground">
                        Nothing received for this business yet.
                    </p>
                ) : (
                    <ul className="grid gap-1.5">
                        {detail.events.map((e) => (
                            <li
                                key={e.id}
                                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b pb-1.5 last:border-b-0"
                            >
                                <span className="font-mono text-[12px]">
                                    {e.type}
                                </span>
                                <span className="text-muted-foreground">
                                    {istDateTime(e.receivedAt)}
                                    {e.processedAt ? "" : " · not applied yet"}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}

function mono(value: string | null): ReactNode {
    return value ? (
        <span className="break-all font-mono text-[12px]">{value}</span>
    ) : null;
}

/** Label and value rows; a row with nothing to say is left out. */
function Facts({ rows }: { rows: [string, ReactNode][] }) {
    return (
        <dl className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-x-4 gap-y-2">
            {rows
                .filter(([, value]) => value !== null && value !== undefined)
                .map(([label, value]) => (
                    <div key={label} className="contents">
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd className="min-w-0">{value}</dd>
                    </div>
                ))}
        </dl>
    );
}
