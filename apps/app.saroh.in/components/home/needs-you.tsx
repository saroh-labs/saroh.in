"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/empty-state";
import { cn } from "@saroh/ui/lib/utils";
import { CheckCircle2, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { formatOverdue, formatWaiting } from "@/lib/format/datetime";
import { formatMoney } from "@/lib/format/money";
import type { HomeAction, HomeEvidence } from "@/lib/home/service";

import { SEVERITY } from "./severity";

/**
 * The ranked work, with the rows that justify it.
 *
 * The old Home said "Fulfil 5 open orders" and stopped. That is a number, not a
 * decision: the merchant still had to open Commerce, find the five, and work
 * out which mattered. Each action now carries the actual rows — who is waiting,
 * how much is at stake, how long it has been — so the judgement can be made
 * here and the click goes straight to the one row that needs it.
 *
 * Evidence is capped by the API at five rows with the true total alongside, so
 * "Showing 5 of 23" is stated rather than implied. A truncated list that looks
 * complete is worse than no list.
 */

/**
 * The verb each action offers, keyed by the API's stable action code.
 *
 * §4 asks Home to answer "what should I do next?", and "Open" does not answer
 * it — five identical Opens make the merchant read every title to tell them
 * apart, which is the work Home exists to remove. A named verb states the job
 * at the point of decision.
 *
 * Kept client-side, next to the rest of the UI copy, rather than added to the
 * read model: the label is presentation, and the API already gives a stable
 * `code` to key it on. Anything unmapped falls back to "Open", so a new action
 * type degrades to today's behaviour rather than rendering blank.
 */
const ACTION_VERB: Record<string, string> = {
    CRM_OVERDUE_FOLLOWUPS: "Follow up",
    COMMERCE_OPEN_ORDERS: "Fulfil orders",
    COMMERCE_SUGGEST_PRODUCT: "Add a product",
    INSIGHTS_VIEW: "View insights",
};

function verbFor(action: HomeAction): string {
    return (
        ACTION_VERB[action.code] ??
        (action.severity === "SETUP" ? "Finish setup" : "Open")
    );
}

/**
 * Which actions earn a block of their own.
 *
 * ATTENTION and OVERDUE are work that is already late or already waiting on
 * someone. SETUP and SUGGESTION are advice — worth offering, not worth the same
 * weight, and stacking them as equals is what turned a ranked queue back into a
 * list of tiles. They collapse to one line beneath the real work.
 */
function isConsequential(action: HomeAction): boolean {
    return action.severity === "ATTENTION" || action.severity === "OVERDUE";
}

/** Which side of the deadline this row's timestamp describes. */
function timing(action: HomeAction, row: HomeEvidence, now: Date) {
    // An overdue follow-up's `at` is a DUE date — the fact is how late it is.
    // An open order's `at` is when it was PLACED — the fact is how long the
    // customer has waited. Same field, opposite reading; conflating them would
    // report a fresh order as "20 days overdue".
    return action.severity === "OVERDUE" && action.code.endsWith("FOLLOWUPS")
        ? formatOverdue(row.at, now)
        : formatWaiting(row.at, now);
}

function EvidenceRow({
    action,
    row,
    now,
}: {
    action: HomeAction;
    row: HomeEvidence;
    now: Date;
}) {
    const amount = formatMoney(row.amountMinor, row.currency);
    const when = timing(action, row, now);
    const late = when?.includes("overdue") ?? false;

    return (
        <li>
            <Link
                href={row.href}
                className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{row.title}</p>
                    {row.subtitle ? (
                        <p className="truncate text-xs text-muted-foreground">
                            {row.subtitle}
                        </p>
                    ) : null}
                </div>

                {when ? (
                    <span
                        className={cn(
                            "hidden shrink-0 text-xs tabular-nums sm:inline",
                            late
                                ? "font-medium text-warning-subtle-foreground"
                                : "text-muted-foreground",
                        )}
                    >
                        {when}
                    </span>
                ) : null}

                {amount ? (
                    <span className="shrink-0 text-sm font-medium tabular-nums">
                        {amount}
                    </span>
                ) : null}

                <ChevronRight className="size-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
            </Link>
        </li>
    );
}

function ActionBlock({
    action,
    now,
    primary,
    index,
}: {
    action: HomeAction;
    now: Date;
    primary: boolean;
    /** Position in the list, used only to stagger the arrival. */
    index: number;
}) {
    const severity = SEVERITY[action.severity];
    const evidence = action.evidence ?? [];
    const hidden = (action.count ?? evidence.length) - evidence.length;

    return (
        <section
            style={{ "--wk-i": index } as React.CSSProperties}
            className={cn(
                "wk-item relative overflow-hidden rounded-md border border-border bg-card",
                // The primary action is the one thing the page is for. It earns
                // a brighter edge rather than a bigger font: the merchant scans
                // the same list either way, and shouting distorts the ranking.
                primary && "border-border/80 shadow-sm",
            )}
        >
            {/* A severity rail rather than a tinted panel: colour on the edge
                stays legible in both registers, while a tinted background has
                to be re-tuned for every skin and still fights the text. */}
            <span
                aria-hidden
                className={cn("absolute inset-y-0 left-0 w-0.5", severity.rail)}
            />

            <header className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-center gap-2.5">
                    <Badge className={cn("shrink-0", severity.badge)}>
                        {severity.label}
                    </Badge>
                    <h3 className="truncate text-sm font-medium">
                        {action.title}
                    </h3>
                </div>
                {/*
                 * Short label, specific accessible name. Home offers one of
                 * these per action, so a screen-reader user listing the page's
                 * links would otherwise hear "Open" five times with nothing to
                 * choose between them — the WCAG 2.4.4 failure the audit found
                 * on the providers page, which this surface was about to repeat.
                 */}
                {/*
                 * One CTA, named. The design shows a filled verb button beside
                 * a secondary "Open", but both would point at the same href
                 * here, and two buttons to one destination is noise — so the
                 * verb replaces "Open" rather than sitting next to it.
                 *
                 * The accessible name still carries the action title, for the
                 * same WCAG 2.4.4 reason the old label did: a screen-reader
                 * user listing the page's links must be able to tell five
                 * "Follow up" buttons apart.
                 */}
                <Button
                    size="sm"
                    variant={primary ? "brand" : "outline"}
                    className="shrink-0"
                    asChild
                >
                    <Link
                        href={action.href}
                        aria-label={`${verbFor(action)}: ${action.title}`}
                    >
                        {verbFor(action)}
                    </Link>
                </Button>
            </header>

            {evidence.length > 0 ? (
                <>
                    <ul className="divide-y divide-border border-t border-border">
                        {evidence.map((row) => (
                            <EvidenceRow
                                key={row.id}
                                action={action}
                                row={row}
                                now={now}
                            />
                        ))}
                    </ul>
                    {hidden > 0 ? (
                        <Link
                            href={action.href}
                            className="block border-t border-border px-4 py-2 text-xs text-muted-foreground hover:text-foreground"
                        >
                            {hidden} more →
                        </Link>
                    ) : null}
                </>
            ) : null}
        </section>
    );
}

export function NeedsYou({
    actions,
    now,
}: {
    actions: HomeAction[];
    now: Date;
}) {
    if (actions.length === 0) {
        return (
            <EmptyState
                // A SUCCESS state, not an absence — so it gets a tick rather
                // than a crossed-out glyph, and no action: there is nothing the
                // merchant should be doing here, and inventing a CTA would
                // manufacture work out of a clean queue.
                icon={<CheckCircle2 className="text-success" />}
                title="You're all caught up"
                description="Nothing needs your attention right now. New work shows up here."
                className="py-10"
            />
        );
    }

    const consequential = actions.filter(isConsequential);
    const quiet = actions.filter((a) => !isConsequential(a));

    // Everything is advice: there is no real queue to bury it under, so show it
    // rather than collapsing a page down to a single grey line.
    const blocks = consequential.length > 0 ? consequential : quiet;
    const collapsed = consequential.length > 0 ? quiet : [];

    return (
        <div className="space-y-3">
            {blocks.map((action, i) => (
                <ActionBlock
                    key={action.code}
                    action={action}
                    now={now}
                    primary={i === 0}
                    index={i}
                />
            ))}
            {collapsed.length > 0 ? <QuietActions actions={collapsed} /> : null}
        </div>
    );
}

/**
 * The advice, on one line.
 *
 * Setup and suggestion rows are worth offering and not worth a block each —
 * given equal weight they turn the ranked queue back into the tiled dashboard
 * §8 asks Home not to be. Collapsed they stay available and stop competing
 * with work that is actually late.
 */
function QuietActions({ actions }: { actions: HomeAction[] }) {
    const [open, setOpen] = useState(false);

    if (open) {
        return (
            <div className="space-y-3">
                {actions.map((action, i) => (
                    <ActionBlock
                        key={action.code}
                        action={action}
                        now={new Date()}
                        primary={false}
                        index={i}
                    />
                ))}
                <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded px-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    Show less
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-md border border-border bg-muted/30 px-4 py-2.5">
            <p className="min-w-0 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                    {actions.length} more
                </span>
                {": "}
                {/* Titles are sentences and some end in a full stop, which
                    joined naively reads "…can book., Review this week's…".
                    Trim the terminal punctuation so the summary reads as one
                    list rather than a run of collided sentences. */}
                {actions
                    .map((a) => a.title.replace(/[.。]\s*$/, ""))
                    .join(", ")}
            </p>
            <button
                type="button"
                onClick={() => setOpen(true)}
                // A real control, not a link: it reveals what is already on the
                // page rather than navigating, and it must work by thumb (§17).
                className="shrink-0 rounded px-1 py-0.5 text-xs font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                Show all
            </button>
        </div>
    );
}
