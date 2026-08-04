import { Badge } from "@saroh/ui/badge";
import { cn } from "@saroh/ui/lib/utils";
import { ChevronRight } from "lucide-react";
import Link from "next/link";

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
}: {
    action: HomeAction;
    now: Date;
    primary: boolean;
}) {
    const severity = SEVERITY[action.severity];
    const evidence = action.evidence ?? [];
    const hidden = (action.count ?? evidence.length) - evidence.length;

    return (
        <section
            className={cn(
                "relative overflow-hidden rounded-md border border-border bg-card",
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
                <Link
                    href={action.href}
                    aria-label={`Open: ${action.title}`}
                    className="shrink-0 rounded text-xs font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                    Open
                </Link>
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
            <div className="rounded-md border border-dashed border-border px-6 py-10 text-center">
                <p className="text-sm font-medium">
                    You&rsquo;re all caught up
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                    Nothing needs your attention right now. New work shows up
                    here.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {actions.map((action, i) => (
                <ActionBlock
                    key={action.code}
                    action={action}
                    now={now}
                    primary={i === 0}
                />
            ))}
        </div>
    );
}
