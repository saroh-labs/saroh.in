"use client";

import { formatDate } from "@/lib/format/datetime";
import { formatMoneyMajor } from "@/lib/format/money";
import { AbsentValue } from "@saroh/ui/absent-value";
import { Button } from "@saroh/ui/button";
import { FailedRead } from "@saroh/ui/failed-read";
import { IntentLink } from "@saroh/ui/intent-link";
import { cn } from "@saroh/ui/lib/utils";

import { CallThem } from "@/components/invoices/details/call-them";
import { RecordPaymentSheet } from "@/components/invoices/payments/record-payment-sheet";
import { QuickLook, QuickLookCard } from "@/components/shared/forms/quick-look";
import { PayLinkRow } from "@/components/subscriptions/subscription-detail/panels";
import { useSubscriptionActions } from "@/components/subscriptions/subscription-detail/use-subscription-actions";
import { InvoiceSaveFor } from "@/lib/invoices/use-invoices";
import { useSubscriptionSave } from "@/lib/subscriptions/use-subscriptions";
import { EmptyState } from "@saroh/ui/data-state";
import { useState } from "react";

import { StatusBadge } from "@/components/shared/lists/status-badge";
import type {
    Optional,
    Plan,
    Subscription,
    SubscriptionCharge,
} from "@/lib/subscriptions/service";
import {
    chargeHref,
    chargeRow,
    collectionRows,
    failWhy,
    initials,
    keepsLine,
    listTab,
    olderPrice,
    pausedText,
    recurringPrice,
    sortCharges,
    statusLabel,
    subscriptionPay,
    TAB_TONE,
} from "@/lib/subscriptions/view";
import { Notice } from "@saroh/ui/notice";

const EYEBROW = "label";

/**
 * The steps a quick look opens the full page for, by where the subscription
 * stands. A failed renewal's new link and payment are done here instead
 * (finding 21), for a role that may; Pause and Cancel stay on the page.
 */
const EDITS = {
    active: [
        ["Pause", "pause"],
        ["Change plan", "switch"],
        ["Cancel", "cancel"],
    ],
    failed: [
        ["Try again or fix payment", ""],
        ["Pause instead", "pause"],
        ["Cancel", "cancel"],
    ],
    paused: [["Resume or cancel", ""]],
    cancelled: [["Restart as a new subscription", "restart"]],
} as const;

/**
 * A row's quick look, after the design, in the shared quick-look sheet:
 * where it stands, the next charge, the next three collections and the last
 * three charges — and ways into the full page. A renewal that isn't paid
 * shows who to ring and takes a new payment link or a payment right here
 * (finding 21); "Change it" opens the page with the step ready
 * (`?do=pause|switch|cancel|restart`) for everything else.
 */
export function SubscriptionQuickLook({
    sub,
    onClose,
    plans,
    charges,
    canWrite,
    canPayLink = false,
    now,
}: {
    sub: Subscription | null;
    onClose: () => void;
    plans: readonly Plan[];
    charges: Optional<Record<string, SubscriptionCharge[]>>;
    canWrite: boolean;
    /** A new link and Record payment need `invoice:write` too. */
    canPayLink?: boolean;
    now: Date;
}) {
    const onOpenChange = (open: boolean) => (!open ? onClose() : null);
    if (!sub) {
        return (
            <QuickLook
                open={false}
                onOpenChange={onOpenChange}
                title=""
                description=""
            >
                {null}
            </QuickLook>
        );
    }
    // What they pay a period, GST and all.
    const price = recurringPrice(
        subscriptionPay(sub),
        sub.currency,
        sub.interval,
    );
    return (
        <QuickLook
            open
            onOpenChange={onOpenChange}
            leading={
                <span
                    aria-hidden
                    className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-[12px] font-bold"
                >
                    {initials(sub.contact.name)}
                </span>
            }
            title={sub.contact.name}
            titleClassName="font-display text-[17px] font-semibold tracking-[-0.02em]"
            subtitle={`${sub.plan.name} · ${price}`}
            description={`${sub.contact.name}'s subscription: ${sub.plan.name}, ${price}.`}
            footer={
                <Button asChild className="min-w-[160px] flex-1">
                    <IntentLink href={`/billing/subscriptions/${sub.id}`}>
                        Open full details
                    </IntentLink>
                </Button>
            }
        >
            <Body
                key={sub.id}
                sub={sub}
                plans={plans}
                charges={charges}
                canWrite={canWrite}
                canPayLink={canPayLink}
                now={now}
            />
        </QuickLook>
    );
}

function Body({
    sub,
    plans,
    charges,
    canWrite,
    canPayLink,
    now,
}: {
    sub: Subscription;
    plans: readonly Plan[];
    charges: Optional<Record<string, SubscriptionCharge[]>>;
    canWrite: boolean;
    canPayLink: boolean;
    now: Date;
}) {
    const tab = listTab(sub);
    // The page's own writes: the list and this sheet read again after each.
    const { busy, payLink, newPayLink } = useSubscriptionActions(
        sub,
        plans,
        now,
        () => undefined,
    );
    const { saved } = useSubscriptionSave();
    const [paying, setPaying] = useState(false);
    const failedId = sub.failedCharge?.id ?? null;
    // Money is collected here only by a role that may write invoices too.
    const collectHere = tab === "failed" && canWrite && canPayLink && failedId;
    const first = sub.contact.name.split(" ")[0] || sub.contact.name;
    const tz = sub.timezone;
    const href = `/billing/subscriptions/${sub.id}`;
    const older = olderPrice(sub, plans);
    const next = sub.pendingPlan ?? sub;
    const nextBig =
        tab === "active" && sub.nextRenewalAt && !sub.endsAt
            ? formatMoneyMajor(subscriptionPay(next), next.currency)
            : tab === "failed"
              ? formatMoneyMajor(
                    sub.failedCharge?.total ?? subscriptionPay(sub),
                    sub.currency,
                )
              : null;
    const nextLine =
        tab === "active"
            ? sub.endsAt
                ? `Ends ${formatDate(sub.endsAt, tz, { now })}. What's paid for still happens. Nothing more is charged.`
                : sub.startsAt
                  ? `Starts ${formatDate(sub.startsAt, tz, { now })}. Nothing is charged before then.`
                  : sub.nextRenewalAt
                    ? `On ${formatDate(sub.nextRenewalAt, tz, { now })} · invoiced with a payment link`
                    : "Nothing is due to renew."
            : tab === "failed"
              ? sub.failedCharge?.dueAt
                  ? Date.parse(sub.failedCharge.dueAt) > now.getTime()
                      ? // Autopay didn't collect it before its due date (D13).
                        `Autopay didn't collect it · due ${formatDate(sub.failedCharge.dueAt, tz, { now })}`
                      : `Was due ${formatDate(sub.failedCharge.dueAt, tz, { now })} · not paid yet`
                  : "Not paid yet"
              : tab === "paused"
                ? `${pausedText(sub, now)}. Nothing is charged while paused.`
                : `Ended${sub.cancelledAt ? ` ${formatDate(sub.cancelledAt, tz, { now })}` : ""}. Nothing more is charged.`;
    const upcoming = collectionRows(sub, now).slice(0, 3);
    const mine = charges.state === "ok" ? (charges.data[sub.id] ?? []) : [];
    const last = sortCharges(mine)
        .slice(0, 3)
        .map((c) => chargeRow(c, tz, now, sub));

    return (
        <>
            <QuickLookCard className="py-3.5">
                <div className="flex items-center gap-2">
                    <StatusBadge tone={TAB_TONE[tab]}>
                        {statusLabel(sub)}
                    </StatusBadge>
                    <span className="flex-1" />
                    <span className="text-[12px] text-muted-foreground">
                        Since {formatDate(sub.startedAt, tz, { now })}
                    </span>
                </div>
                <div data-ph-unmask="" className={cn(EYEBROW, "mt-3")}>
                    Next charge
                </div>
                <div className="mt-0.5 font-display text-[24px] font-semibold tabular-nums tracking-[-0.02em]">
                    {nextBig ?? <AbsentValue says="None" />}
                </div>
                <p className="mt-0.5 text-pretty text-[12.5px] leading-[1.5] text-foreground/75">
                    {nextLine}
                </p>
                {older ? (
                    <p className="mt-1.5 text-[12px] text-foreground">
                        {keepsLine(sub, older)}
                    </p>
                ) : null}
                {sub.pendingPlan && tab !== "cancelled" ? (
                    <p className="mt-1.5 text-[12px] font-semibold text-foreground">
                        Changes to {sub.pendingPlan.name} on{" "}
                        {formatDate(sub.pendingPlan.from, tz, { now })}
                    </p>
                ) : null}
            </QuickLookCard>
            {tab === "failed" ? (
                <Notice tone="error">
                    <div className="text-[13px] font-bold text-destructive-subtle-foreground">
                        {failWhy(sub, now)}
                    </div>
                    <div
                        data-ph-unmask=""
                        className="mt-[3px] text-[12px] text-foreground/75"
                    >
                        {sub.chargeFailed
                            ? "The charge was declined, and Saroh doesn't try again on its own."
                            : "Saroh doesn't charge cards for it."}{" "}
                        {collectHere
                            ? "Send a new payment link, or record what they paid you."
                            : "Open it to see what can be done."}
                    </div>
                    {collectHere ? (
                        <div className="mt-2.5 flex flex-wrap gap-2">
                            <Button
                                size="sm"
                                disabled={busy}
                                onClick={newPayLink}
                            >
                                Send new link
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() => setPaying(true)}
                            >
                                Record payment
                            </Button>
                        </div>
                    ) : null}
                    {payLink ? <PayLinkRow url={payLink} name={first} /> : null}
                </Notice>
            ) : null}
            {tab === "failed" && sub.contact.phone ? (
                <QuickLookCard label="Subscriber" className="py-3">
                    <CallThem
                        name={sub.contact.name}
                        email={sub.contact.email}
                        phone={sub.contact.phone}
                    />
                </QuickLookCard>
            ) : null}
            {collectHere ? (
                // Recorded as Invoices records it; then the list and this
                // sheet read again, so it moves off Need you in place.
                <InvoiceSaveFor saved={saved}>
                    <RecordPaymentSheet
                        open={paying}
                        onOpenChange={setPaying}
                        invoice={{ id: collectHere, who: sub.contact.name }}
                    />
                </InvoiceSaveFor>
            ) : null}
            {upcoming.length ? (
                <QuickLookCard label="Next collections" className="pb-1.5 pt-3">
                    {upcoming.map((u) => (
                        <div
                            key={u.date}
                            className="flex items-center gap-2.5 border-t border-border/70 py-[7px]"
                        >
                            <span className="flex-1 text-[13px] font-semibold">
                                {u.label}
                            </span>
                            <StatusBadge tone={u.tone}>{u.state}</StatusBadge>
                        </div>
                    ))}
                </QuickLookCard>
            ) : null}
            <QuickLookCard label="Last charges" className="pb-1.5 pt-3">
                {charges.state === "ok" ? (
                    last.length ? (
                        last.map((c) => (
                            // Each charge opens its invoice (UX-080), as
                            // the subscription's own page does.
                            <IntentLink
                                key={c.id}
                                href={chargeHref(c.id)}
                                aria-label={`${c.number ?? "Invoice"} · ${c.date} · ${c.result} · ${c.amount}`}
                                className="-mx-1.5 flex items-baseline gap-2.5 rounded-[6px] border-t border-border/70 px-1.5 py-[7px] transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-accent-active coarse:min-h-11 coarse:items-center"
                            >
                                <span className="w-[60px] shrink-0 text-[12.5px] text-muted-foreground">
                                    {c.date}
                                </span>
                                <StatusBadge tone={c.tone}>
                                    {c.result}
                                </StatusBadge>
                                <span className="flex-1" />
                                <span className="font-semibold tabular-nums">
                                    {c.amount}
                                </span>
                            </IntentLink>
                        ))
                    ) : (
                        <EmptyState
                            size="inline"
                            className="border-t border-border/70 py-2"
                            title="No charges yet."
                        />
                    )
                ) : charges.state === "failed" ? (
                    // The charges are the list page's read, handed down:
                    // Try again reads the page again and they arrive here.
                    <FailedRead
                        className="border-t border-border/70 py-2"
                        things="the charges"
                        reassurance="The rest is up to date."
                    />
                ) : (
                    <p
                        data-ph-unmask=""
                        role="note"
                        className="border-t border-border/70 py-2 text-[12.5px] text-muted-foreground"
                    >
                        Your role can&apos;t see invoices, so charges
                        aren&apos;t shown.
                    </p>
                )}
            </QuickLookCard>
            {canWrite ? (
                <QuickLookCard label="Change it" className="py-3">
                    <div className="flex flex-wrap gap-2">
                        {EDITS[tab]
                            // Done above in this sheet, when it can be.
                            .filter(([, step]) => !(collectHere && step === ""))
                            .map(([label, step]) => (
                                <IntentLink
                                    key={label}
                                    href={step ? `${href}?do=${step}` : href}
                                    className={cn(
                                        "inline-flex h-[38px] items-center rounded-[9px] border border-border bg-card px-4 text-[14px] font-semibold hover:bg-muted coarse:h-11",
                                        step === "cancel"
                                            ? "text-destructive-subtle-foreground"
                                            : "text-foreground",
                                    )}
                                >
                                    {label}
                                </IntentLink>
                            ))}
                    </div>
                    <p
                        data-ph-unmask=""
                        className="mt-2 text-[11.5px] text-muted-foreground"
                    >
                        {tab === "cancelled"
                            ? "Starts a new subscription at today's price. The old one keeps its history."
                            : "Opens the subscription with that step ready. Nothing changes until you confirm there."}
                    </p>
                </QuickLookCard>
            ) : (
                <p
                    data-ph-unmask=""
                    className="text-[12px] text-muted-foreground"
                >
                    Your role can see this subscription but not change it.
                </p>
            )}
        </>
    );
}
