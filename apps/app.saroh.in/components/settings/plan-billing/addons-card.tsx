"use client";

import { Button } from "@saroh/ui/button";
import { IconButton } from "@saroh/ui/icon-button";
import { cn } from "@saroh/ui/lib/utils";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setAddonAction } from "@/lib/saroh-billing/billing-actions";
import type { AddonRow } from "@/lib/saroh-billing/plan-view";

import { runAction } from "@/lib/api/run-action";
import { card } from "./styles";

/**
 * Add-ons ("Saroh Settings" design; U16): what the plan can take more of,
 * a pack or a unit at a time (− n +), or a module switched on (Add /
 * Remove). Limits move at once; billed with the plan's next charge. The
 * heading's sum is the API's (`heldPaise`).
 */
export function AddonsCard({
    rows,
    sum,
    max,
    canChange,
}: {
    rows: AddonRow[];
    /** "₹500 a month in add-ons", or "" with none. */
    sum: string;
    max: number;
    canChange: boolean;
}) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const [busy, setBusy] = useState<string | null>(null);

    function set(row: AddonRow, quantity: number) {
        setBusy(row.id);
        start(async () => {
            const res = await runAction(
                () => setAddonAction(row.id, quantity),
                { setBusy: (on) => setBusy(on ? row.id : null) },
            );
            if (!res) return;
            if (!res.ok) {
                showError(res.error);
                return;
            }
            if (row.isModule) {
                showSuccess(
                    quantity
                        ? `${row.name} added. It's yours from today.`
                        : `${row.name} removed.`,
                );
            }
            router.refresh();
        });
    }

    return (
        <section aria-label="Add-ons" className={card}>
            <div className="flex flex-wrap items-baseline gap-2 border-b border-border/70 px-[18px] py-3">
                <span className="flex-auto font-display text-[15px] font-semibold">
                    Add-ons
                </span>
                {sum ? (
                    <span className="text-[12.5px] text-muted-foreground">
                        {sum}
                    </span>
                ) : null}
            </div>
            {rows.map((row, i) => {
                const off = !canChange || pending;
                return (
                    <div
                        key={row.id}
                        aria-busy={busy === row.id || undefined}
                        className={cn(
                            "flex flex-wrap items-center gap-3 px-[18px] py-3",
                            i > 0 && "border-t border-border/70",
                        )}
                    >
                        <div className="min-w-0 flex-[1_1_240px]">
                            <p className="text-[14px] font-semibold">
                                {row.name}
                            </p>
                            <p className="mt-0.5 text-[12px] text-muted-foreground">
                                {row.line}
                            </p>
                        </div>
                        {row.total ? (
                            <span className="text-[12.5px] text-foreground/80">
                                {row.total}
                            </span>
                        ) : null}
                        {row.isModule ? (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={
                                    off || (!row.quantity && !row.available)
                                }
                                onClick={() => set(row, row.quantity ? 0 : 1)}
                            >
                                {row.quantity ? "Remove" : "Add"}
                            </Button>
                        ) : (
                            <div className="flex items-center gap-1">
                                <IconButton
                                    label={`Fewer: ${row.name}`}
                                    icon={<span>−</span>}
                                    variant="outline"
                                    disabled={off || row.quantity === 0}
                                    onClick={() => set(row, row.quantity - 1)}
                                />
                                <span className="min-w-6 text-center font-semibold tabular-nums">
                                    {row.quantity}
                                </span>
                                <IconButton
                                    label={`More: ${row.name}`}
                                    icon={<span>+</span>}
                                    variant="outline"
                                    disabled={
                                        off ||
                                        !row.available ||
                                        row.quantity >= max
                                    }
                                    onClick={() => set(row, row.quantity + 1)}
                                />
                            </div>
                        )}
                    </div>
                );
            })}
        </section>
    );
}
