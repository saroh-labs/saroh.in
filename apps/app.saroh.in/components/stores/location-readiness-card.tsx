"use client";

import { Button } from "@saroh/ui/button";
import { Check } from "lucide-react";
import Link from "next/link";

import type {
    LocationReadiness,
    ReadyItem,
} from "@/lib/stores/location-readiness";

import { jumpTo } from "./location-save";

/**
 * "Ready for online orders · 2 of 4" at the top of a location (the 9 Oct
 * audit): what's already done first, then each step left with the one thing
 * that does it. The items are `locationReadiness`'s, read from what the page
 * holds. Once everything is done it folds to one quiet line.
 *
 * Drawn like Settings' "Get ready to take money" card, so the two read as
 * one family. A step done on this page (the address, delivery) is offered
 * only to someone who can change it; one done elsewhere (a provider, the
 * website) keeps its link, and that page says who can.
 */
export function LocationReadinessCard({
    readiness,
    canEdit,
}: {
    readiness: LocationReadiness;
    canEdit: boolean;
}) {
    const { heading, items, done, total } = readiness;
    if (total === 0) return null;

    if (done === total) {
        return (
            <p
                data-testid="location-ready"
                className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-[13px] font-medium"
            >
                <Check
                    aria-hidden
                    className="size-4 shrink-0 text-success-subtle-foreground"
                />
                {heading}
            </p>
        );
    }

    const pct = Math.round((100 * done) / total);
    return (
        <section
            aria-labelledby="location-ready-heading"
            data-testid="location-readiness"
            className="grid gap-2.5 rounded-xl border border-highlight-border bg-brand-subtle px-4 py-3"
        >
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <h2
                    id="location-ready-heading"
                    className="font-display text-[15px] font-semibold tracking-[-0.01em]"
                >
                    {heading}
                </h2>
                <span className="text-[12.5px] tabular-nums text-foreground/80">
                    {done} of {total}
                </span>
                <div
                    role="progressbar"
                    aria-label={heading}
                    aria-valuemin={0}
                    aria-valuemax={total}
                    aria-valuenow={done}
                    aria-valuetext={`${done} of ${total} done`}
                    className="ml-auto h-1.5 max-w-[200px] flex-[1_1_120px] self-center overflow-hidden rounded-full bg-muted"
                >
                    <div
                        className="h-full rounded-full bg-highlight"
                        style={{ width: `${pct}%` }}
                    />
                </div>
            </div>
            <ul className="grid gap-2">
                {items.map((item) => (
                    <Item key={item.key} item={item} canEdit={canEdit} />
                ))}
            </ul>
        </section>
    );
}

function Item({ item, canEdit }: { item: ReadyItem; canEdit: boolean }) {
    if (item.done) {
        return (
            <li className="flex items-center gap-2.5 text-[13px] text-foreground/80">
                <Check
                    aria-hidden
                    className="size-3.5 shrink-0 text-success-subtle-foreground"
                />
                <span className="min-w-0">
                    <span className="sr-only">Done: </span>
                    {item.label}
                </span>
            </li>
        );
    }
    const action =
        item.action && (canEdit || !item.action.inPage) ? item.action : null;
    return (
        <li className="flex min-h-8 flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13px]">
            <span
                aria-hidden
                className="size-[7px] shrink-0 rounded-full bg-highlight"
            />
            <span className="min-w-0 flex-[1_1_200px] font-medium">
                <span className="sr-only">To do: </span>
                {item.label}
            </span>
            {action ? (
                action.inPage ? (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            const id = action.href.slice(1);
                            if (!jumpTo(id)) window.location.hash = id;
                        }}
                    >
                        {action.label}
                    </Button>
                ) : (
                    <Button asChild variant="outline" size="sm">
                        <Link href={action.href}>{action.label}</Link>
                    </Button>
                )
            ) : null}
        </li>
    );
}
