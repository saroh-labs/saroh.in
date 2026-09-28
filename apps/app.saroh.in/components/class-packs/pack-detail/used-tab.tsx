"use client";

import { Button } from "@saroh/ui/button";
import { FailedState, PermissionDeniedState } from "@saroh/ui/data-state";

import { Pill } from "@/components/subscriptions/pill";
import type { UseRow } from "@/lib/class-packs/pack-activity";

const H2 = "m-0 font-display text-[15px] font-semibold tracking-[-0.015em]";

/**
 * Pack Detail's Used this week (E17, after the design): the services the
 * pack pays for, then each class spent from it this week — when, which,
 * who, and what became of it. Read on its own, so a failure is said here
 * and nowhere else.
 */
export function UsedTab({
    rows,
    denied,
    chips,
    emptyText,
    onRetry,
}: {
    /** Null when the week couldn't be read. */
    rows: UseRow[] | null;
    denied: boolean;
    /** "HIIT · drop-in ₹500". */
    chips: string[];
    emptyText: string;
    onRetry: () => void;
}) {
    const head = (
        <div className="mb-2.5 flex flex-wrap items-baseline gap-2.5">
            <h2 className={H2}>Used this week</h2>
        </div>
    );
    if (denied) {
        return (
            <>
                {head}
                <PermissionDeniedState
                    title="You can't see what this pack paid for"
                    description="Your role doesn't reach the bookings paid with packs."
                    note="An owner or admin can change what your role reaches in Team."
                />
            </>
        );
    }
    if (!rows) {
        return (
            <>
                {head}
                <FailedState
                    title="Used this week could not be loaded"
                    description="This tab couldn't read the classes paid with the pack. Nothing has changed — every booking and credit is as it was."
                    action={
                        <Button variant="outline" onClick={onRetry}>
                            Try again
                        </Button>
                    }
                />
            </>
        );
    }
    return (
        <>
            {head}
            {chips.length > 0 ? (
                <ul
                    aria-label="Paid for with this pack"
                    className="m-0 flex list-none flex-wrap gap-1.5 p-0"
                >
                    {chips.map((c) => (
                        <li
                            key={c}
                            className="rounded-full border border-border bg-muted/50 px-2.5 py-[5px] text-[12.5px]"
                        >
                            {c}
                        </li>
                    ))}
                </ul>
            ) : null}
            {rows.length === 0 ? (
                <p className="m-0 pb-0.5 pt-3 text-[13px] text-muted-foreground">
                    {emptyText}
                </p>
            ) : (
                <ul className="m-0 mt-2 grid list-none p-0">
                    {rows.map((u) => (
                        <li
                            key={u.key}
                            className="flex flex-wrap items-center gap-2.5 border-t border-border/70 py-2 text-[13px]"
                        >
                            <span className="flex-[0_0_120px] tabular-nums text-muted-foreground">
                                {u.when}
                            </span>
                            <span className="min-w-0 flex-[1_1_140px] font-semibold">
                                {u.what}
                            </span>
                            <span className="min-w-0 flex-[1_1_140px] text-foreground/80">
                                {u.who}
                            </span>
                            <Pill tone={u.state.tone}>{u.state.label}</Pill>
                        </li>
                    ))}
                </ul>
            )}
        </>
    );
}
