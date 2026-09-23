"use client";

import { cn } from "@saroh/ui/lib/utils";
import {
    Sheet,
    SheetClose,
    SheetContent,
    SheetDescription,
    SheetTitle,
} from "@saroh/ui/sheet";
import { X } from "lucide-react";
import Link from "next/link";

import type {
    Optional,
    Plan,
    Subscription,
    SubscriptionCharge,
} from "@/lib/subscriptions/service";
import {
    chargeRow,
    collectionRows,
    dayText,
    failWhy,
    initials,
    listTab,
    longPrice,
    money,
    olderPrice,
    sortCharges,
    TAB_LABEL,
    TAB_TONE,
} from "@/lib/subscriptions/view";

import { Pill } from "./pill";

const CARD = "rounded-xl border border-border bg-card";
const EYEBROW =
    "text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground";

/** The steps a quick look offers, by where the subscription stands. */
const EDITS = {
    active: [
        ["Pause", "pause"],
        ["Change plan", "switch"],
        ["Cancel", "cancel"],
    ],
    failed: [
        ["Retry or fix payment", ""],
        ["Pause instead", "pause"],
        ["Cancel", "cancel"],
    ],
    paused: [["Resume or cancel", ""]],
    cancelled: [["Restart as a new subscription", "restart"]],
} as const;

/**
 * A row's quick look, after the design: where it stands, the next charge,
 * the next three collections and the last three charges — and ways into the
 * full page. "Change it" opens that page with the step ready
 * (`?do=pause|switch|cancel`); nothing changes from here.
 */
export function SubscriptionQuickLook({
    sub,
    onClose,
    plans,
    charges,
    canWrite,
    now,
}: {
    sub: Subscription | null;
    onClose: () => void;
    plans: readonly Plan[];
    charges: Optional<Record<string, SubscriptionCharge[]>>;
    canWrite: boolean;
    now: Date;
}) {
    return (
        <Sheet
            open={sub !== null}
            onOpenChange={(o) => (!o ? onClose() : null)}
        >
            <SheetContent
                className="flex w-full flex-col gap-0 bg-background p-0 focus:outline-none sm:max-w-[440px] [&>button:last-child]:hidden"
                onOpenAutoFocus={(e) => {
                    e.preventDefault();
                    (e.currentTarget as HTMLElement | null)?.focus();
                }}
            >
                {sub ? (
                    <Body
                        sub={sub}
                        plans={plans}
                        charges={charges}
                        canWrite={canWrite}
                        now={now}
                    />
                ) : null}
            </SheetContent>
        </Sheet>
    );
}

function Body({
    sub,
    plans,
    charges,
    canWrite,
    now,
}: {
    sub: Subscription;
    plans: readonly Plan[];
    charges: Optional<Record<string, SubscriptionCharge[]>>;
    canWrite: boolean;
    now: Date;
}) {
    const tab = listTab(sub);
    const tz = sub.timezone;
    const href = `/billing/subscriptions/${sub.id}`;
    const older = olderPrice(sub, plans);
    const next = sub.pendingPlan ?? sub;
    const nextBig =
        tab === "active" && sub.nextRenewalAt && !sub.endsAt
            ? money(next.price, next.currency)
            : tab === "failed"
              ? money(sub.failedCharge?.total ?? sub.price, sub.currency)
              : "—";
    const nextLine =
        tab === "active"
            ? sub.endsAt
                ? `Ends ${dayText(sub.endsAt, tz, now)} — what's paid for still happens. Nothing more is charged.`
                : sub.startsAt
                  ? `Starts ${dayText(sub.startsAt, tz, now)}. Nothing is charged before then.`
                  : sub.nextRenewalAt
                    ? `On ${dayText(sub.nextRenewalAt, tz, now)} · invoiced with a pay link`
                    : "Nothing is due to renew."
            : tab === "failed"
              ? sub.failedCharge?.dueAt
                  ? `Was due ${dayText(sub.failedCharge.dueAt, tz, now)} · not paid yet`
                  : "Not paid yet"
              : tab === "paused"
                ? `Paused${sub.pausedAt ? ` since ${dayText(sub.pausedAt, tz, now)}` : ""}. Nothing is charged while paused.`
                : `Ended${sub.cancelledAt ? ` ${dayText(sub.cancelledAt, tz, now)}` : ""}. Nothing more is charged.`;
    const upcoming = collectionRows(sub, now).slice(0, 3);
    const mine = charges.state === "ok" ? (charges.data[sub.id] ?? []) : [];
    const last = sortCharges(mine)
        .slice(0, 3)
        .map((c) => chargeRow(c, tz, now));

    return (
        <>
            <div className="flex items-center gap-2.5 border-b border-border bg-card px-[18px] py-3.5">
                <span
                    aria-hidden
                    className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-[12px] font-bold"
                >
                    {initials(sub.contact.name)}
                </span>
                <div className="min-w-0 flex-1">
                    <SheetTitle className="truncate font-display text-[17px] font-semibold tracking-[-0.02em]">
                        {sub.contact.name}
                    </SheetTitle>
                    <SheetDescription className="truncate text-[12px] text-muted-foreground">
                        {sub.plan.name} ·{" "}
                        {longPrice(sub.price, sub.currency, sub.interval)}
                    </SheetDescription>
                </div>
                <SheetClose
                    aria-label="Close"
                    className="flex size-[34px] shrink-0 items-center justify-center rounded-[9px] bg-muted text-foreground/75 hover:bg-secondary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 coarse:size-11"
                >
                    <X className="size-4" strokeWidth={2} aria-hidden />
                </SheetClose>
            </div>
            <div className="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto px-[18px] py-4">
                <div className={cn(CARD, "px-4 py-3.5")}>
                    <div className="flex items-center gap-2">
                        <Pill tone={TAB_TONE[tab]}>{TAB_LABEL[tab]}</Pill>
                        <span className="flex-1" />
                        <span className="text-[12px] text-muted-foreground">
                            Since {dayText(sub.startedAt, tz, now)}
                        </span>
                    </div>
                    <div className={cn(EYEBROW, "mt-3")}>Next charge</div>
                    <div className="mt-0.5 font-display text-[24px] font-semibold tabular-nums tracking-[-0.02em]">
                        {nextBig}
                    </div>
                    <p className="mt-0.5 text-pretty text-[12.5px] leading-[1.5] text-foreground/75">
                        {nextLine}
                    </p>
                    {older ? (
                        <p className="mt-1.5 text-[12px] text-brand">
                            Keeps {money(sub.price, sub.currency)} — the plan is{" "}
                            {money(older.listPrice, sub.currency)} for new
                            sign-ups
                        </p>
                    ) : null}
                    {sub.pendingPlan && tab !== "cancelled" ? (
                        <p className="mt-1.5 text-[12px] font-semibold text-brand">
                            Changes to {sub.pendingPlan.name} on{" "}
                            {dayText(sub.pendingPlan.from, tz, now)}
                        </p>
                    ) : null}
                </div>
                {tab === "failed" ? (
                    <div
                        role="alert"
                        className="rounded-xl border border-destructive-subtle-foreground bg-destructive-subtle px-3.5 py-[11px]"
                    >
                        <div className="text-[13px] font-bold text-destructive-subtle-foreground">
                            {failWhy(sub, now)}
                        </div>
                        <div className="mt-[3px] text-[12px] text-foreground/75">
                            Saroh doesn&apos;t charge cards — open it to send a
                            new pay link, record a payment, pause or cancel.
                        </div>
                    </div>
                ) : null}
                {upcoming.length ? (
                    <div className={cn(CARD, "px-4 pb-1.5 pt-3")}>
                        <div className={cn(EYEBROW, "mb-1")}>
                            Next collections
                        </div>
                        {upcoming.map((u) => (
                            <div
                                key={u.date}
                                className="flex items-center gap-2.5 border-t border-border/70 py-[7px]"
                            >
                                <span className="flex-1 text-[13px] font-semibold">
                                    {u.label}
                                </span>
                                <Pill tone={u.tone}>{u.state}</Pill>
                            </div>
                        ))}
                    </div>
                ) : null}
                <div className={cn(CARD, "px-4 pb-1.5 pt-3")}>
                    <div className={cn(EYEBROW, "mb-1")}>Last charges</div>
                    {charges.state === "ok" ? (
                        last.length ? (
                            last.map((c) => (
                                <div
                                    key={c.id}
                                    className="flex items-baseline gap-2.5 border-t border-border/70 py-[7px]"
                                >
                                    <span className="w-[60px] shrink-0 text-[12.5px] text-muted-foreground">
                                        {c.date}
                                    </span>
                                    <Pill tone={c.tone}>{c.result}</Pill>
                                    <span className="flex-1" />
                                    <span className="font-semibold tabular-nums">
                                        {c.amount}
                                    </span>
                                </div>
                            ))
                        ) : (
                            <p className="border-t border-border/70 py-2 text-[12.5px] text-muted-foreground">
                                Nothing charged yet.
                            </p>
                        )
                    ) : (
                        <p
                            role={charges.state === "failed" ? "alert" : "note"}
                            className="border-t border-border/70 py-2 text-[12.5px] text-muted-foreground"
                        >
                            {charges.state === "denied"
                                ? "Your role can't see invoices, so charges aren't shown."
                                : "Charges couldn't be loaded. The rest is up to date."}
                        </p>
                    )}
                </div>
                {canWrite ? (
                    <div className={cn(CARD, "px-4 py-3")}>
                        <div className={cn(EYEBROW, "mb-2")}>Change it</div>
                        <div className="flex flex-wrap gap-2">
                            {EDITS[tab].map(([label, step]) => (
                                <Link
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
                                </Link>
                            ))}
                        </div>
                        <p className="mt-2 text-[11.5px] text-muted-foreground">
                            {tab === "cancelled"
                                ? "Starts a new subscription at today's price — the old one keeps its history."
                                : "Opens the subscription with that step ready — nothing changes until you confirm there."}
                        </p>
                    </div>
                ) : (
                    <p className="text-[12px] text-muted-foreground">
                        Your role can see this subscription but not change it.
                    </p>
                )}
            </div>
            <div className="flex gap-2 border-t border-border bg-card px-[18px] py-3">
                <Link
                    href={href}
                    className="flex h-[42px] flex-1 items-center justify-center rounded-[10px] bg-primary text-[14px] font-semibold text-primary-foreground hover:bg-primary-hover"
                >
                    Open full details
                </Link>
            </div>
        </>
    );
}
