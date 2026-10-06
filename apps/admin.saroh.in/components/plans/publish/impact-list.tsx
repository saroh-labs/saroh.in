"use client";

import { formatInr } from "@saroh/pricing-catalog";
import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { Skeleton } from "@saroh/ui/skeleton";

import type { Impact, ImpactTone } from "@/lib/pricing-types";

const TONE_BADGE: Record<ImpactTone, "error" | "warning" | "success" | "info"> =
    {
        danger: "error",
        warn: "warning",
        ok: "success",
        info: "info",
    };

export type ImpactState =
    | { kind: "none" }
    | { kind: "invalid"; errors: string[] }
    | { kind: "loading" }
    | { kind: "failed"; error: string }
    | { kind: "ready"; impact: Impact };

export const PANEL =
    "grid gap-3 rounded-[14px] border border-border-strong bg-background p-4";

/**
 * "What this draft does" (plans catalogue U10): who it touches, what plan
 * revenue does if everyone moves, and each effect with the businesses it
 * reaches. The figures are the API's (`GET /admin/pricing/impact`), only
 * formatted here.
 */
export function ImpactList({
    state,
    onRetry,
}: {
    state: ImpactState;
    onRetry: () => void;
}) {
    return (
        <section aria-label="What this draft does" className={PANEL}>
            <h2 className="font-display text-base font-semibold">
                What this draft does
            </h2>
            <ImpactBody state={state} onRetry={onRetry} />
        </section>
    );
}

function ImpactBody({
    state,
    onRetry,
}: {
    state: ImpactState;
    onRetry: () => void;
}) {
    if (state.kind === "none") {
        return (
            <p className="text-[12.5px] text-muted-foreground">
                No changes yet. Edit a plan, a module or an offer and its effect
                on real businesses shows here.
            </p>
        );
    }
    if (state.kind === "invalid") {
        return (
            <div className="grid gap-1.5 text-[12.5px]">
                <p className="font-semibold text-warning">
                    Not ready to publish
                </p>
                <ul className="grid list-disc gap-[3px] pl-[18px] text-muted-foreground">
                    {state.errors.map((e) => (
                        <li key={e}>{e}</li>
                    ))}
                </ul>
            </div>
        );
    }
    if (state.kind === "loading") {
        return (
            <div aria-busy="true" className="grid gap-2">
                <span className="sr-only">Working out what the draft does</span>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2">
                    <Skeleton className="h-[86px] rounded-[10px]" />
                    <Skeleton className="h-[86px] rounded-[10px]" />
                </div>
                <Skeleton className="h-16 rounded-[10px]" />
            </div>
        );
    }
    if (state.kind === "failed") {
        return (
            <div
                role="alert"
                className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px]"
            >
                <span className="min-w-0 flex-[1_1_240px]">{state.error}</span>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onRetry}
                >
                    Try again
                </Button>
            </div>
        );
    }

    const { impact } = state;
    const d = impact.revenue.nextPaise - impact.revenue.nowPaise;
    return (
        <>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2">
                <Stat
                    label="Businesses affected"
                    value={String(impact.touched)}
                    note={`of ${impact.total} on a plan`}
                />
                <Stat
                    label="Plan revenue a month"
                    value={
                        d === 0
                            ? "No change"
                            : `${d > 0 ? "+" : "−"}${formatInr(Math.abs(d))}`
                    }
                    tone={d > 0 ? "up" : d < 0 ? "down" : undefined}
                    note={
                        d === 0
                            ? `${formatInr(impact.revenue.nowPaise)} today`
                            : `${formatInr(impact.revenue.nowPaise)} → ${formatInr(impact.revenue.nextPaise)} if everyone moves`
                    }
                />
            </div>
            {impact.items.length === 0 ? (
                <p className="text-[12.5px] text-muted-foreground">
                    No changes yet. Edit a plan, a module or an offer and its
                    effect on real businesses shows here.
                </p>
            ) : (
                <ul className="grid gap-2">
                    {impact.items.map((item, i) => (
                        <li
                            key={`${i}-${item.title}`}
                            className="grid gap-1.5 rounded-[10px] border border-border bg-card px-3 py-[11px]"
                        >
                            <div className="flex items-baseline gap-2">
                                <Badge
                                    variant={TONE_BADGE[item.tone]}
                                    className="flex-none rounded-full px-[7px] py-px text-[10.5px] font-semibold"
                                >
                                    {item.label}
                                </Badge>
                                <span className="font-semibold leading-snug">
                                    {item.title}
                                </span>
                            </div>
                            {item.detail && (
                                <span className="text-[12.5px] leading-normal text-foreground/80">
                                    {item.detail}
                                </span>
                            )}
                            {item.businesses.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                    {item.businesses.slice(0, 6).map((b) => (
                                        <span
                                            key={b.id}
                                            className="rounded-full bg-secondary px-2 py-0.5 text-[11.5px] text-foreground/80"
                                        >
                                            {b.name}
                                        </span>
                                    ))}
                                    {item.businesses.length > 6 && (
                                        <span className="rounded-full bg-secondary px-2 py-0.5 text-[11.5px] text-foreground/80">
                                            +{item.businesses.length - 6} more
                                        </span>
                                    )}
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}
            {impact.items.length > 0 && (
                <p className="text-[12px] leading-normal text-muted-foreground">
                    Counts assume businesses move to this version. If they keep
                    their terms, only new businesses and plan changes get it.
                </p>
            )}
        </>
    );
}

function Stat({
    label,
    value,
    note,
    tone,
}: {
    label: string;
    value: string;
    note: string;
    tone?: "up" | "down";
}) {
    return (
        <div className="grid gap-[3px] rounded-[10px] bg-card p-3">
            <span className="text-[11.5px] text-muted-foreground">{label}</span>
            <span
                className={cn(
                    "font-display text-[22px] font-semibold",
                    tone === "up" && "text-success",
                    tone === "down" && "text-destructive",
                )}
            >
                {value}
            </span>
            <span className="text-[11.5px] text-muted-foreground">{note}</span>
        </div>
    );
}
