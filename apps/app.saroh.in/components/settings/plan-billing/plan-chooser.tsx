"use client";

import { Button } from "@saroh/ui/button";
import { FailedState } from "@saroh/ui/data-state";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import type { Cycle, PickerRow } from "@/lib/saroh-billing/plan-view";

import type { PickedPlan } from "./change-plan-dialog";
import { ChangePlanDialog } from "./change-plan-dialog";
import { RefreshButton } from "./refresh-button";
import { card } from "./styles";

/**
 * The plan picker, add-ons and coupon ("Saroh Settings" design, Plan and
 * billing): Monthly | Yearly when the catalogue offers yearly, a row per
 * plan with its button — "Start N-day trial", "Upgrade", "Switch" — and the
 * Coupon card, whose code goes with the next change's quote. Picking a row
 * opens the change (`ChangePlanDialog`).
 *
 * `?plan=&cycle=` on the address opens that plan's change straight away:
 * it is where every "Upgrade" in the app lands (`upgradeHref`).
 */
export function PlanChooser({
    rows,
    yearly,
    initialCycle,
    canChange,
    addons,
}: {
    /** Per cycle; null when Saroh's price list couldn't be read. */
    rows: Record<Cycle, PickerRow[]> | null;
    yearly: { on: false } | { on: true; freeMonths: number };
    initialCycle: Cycle;
    /** `billing:manage`: changing plan is the owner's. */
    canChange: boolean;
    /** The Add-ons card, between the picker and the coupon, as drawn. */
    addons: ReactNode;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const search = useSearchParams();
    const [cycle, setCycle] = useState<Cycle>(
        yearly.on ? initialCycle : "month",
    );
    const [picked, setPicked] = useState<PickedPlan | null>(null);
    const [couponIn, setCouponIn] = useState("");
    const [coupon, setCoupon] = useState("");
    const [couponErr, setCouponErr] = useState("");

    const shown = rows?.[cycle] ?? [];

    // An "Upgrade" from elsewhere in the app: open that plan's change once.
    useEffect(() => {
        const plan = search.get("plan");
        if (!plan || !rows || !canChange) return;
        const want: Cycle =
            search.get("cycle") === "year" && yearly.on ? "year" : cycle;
        const row = rows[want].find((r) => r.planId === plan);
        if (row) {
            setCycle(want);
            setPicked({ planId: row.planId, name: row.name, cycle: want });
        }
        router.replace(`${pathname}#change-plan`, { scroll: false });
        // Once per arrival.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    function apply() {
        const code = couponIn.trim().toUpperCase();
        if (!code) {
            setCouponErr("Type a code first.");
            return;
        }
        if (!/^[A-Z0-9_-]{1,32}$/.test(code)) {
            setCouponErr("That code isn't valid.");
            return;
        }
        setCoupon(code);
        setCouponIn("");
        setCouponErr("");
    }

    return (
        <>
            <section
                id="change-plan"
                aria-label="Change plan"
                className={cn(card, "scroll-mt-4")}
            >
                <div className="flex flex-wrap items-center gap-2.5 border-b border-border/70 px-[18px] py-3">
                    <span className="flex-[1_1_260px] text-[12.5px] text-muted-foreground">
                        {canChange
                            ? "Change plan any time. Upgrades start today; downgrades from your next charge."
                            : "Changing plan is the owner's. These are Saroh's plans and what each is for."}
                    </span>
                    {yearly.on && rows ? (
                        <div
                            role="radiogroup"
                            aria-label="Billing"
                            className="flex gap-0.5 rounded-[9px] border border-border bg-muted/50 p-[3px]"
                        >
                            {(["month", "year"] as const).map((c) => (
                                <button
                                    key={c}
                                    type="button"
                                    role="radio"
                                    aria-checked={cycle === c}
                                    onClick={() => setCycle(c)}
                                    className={cn(
                                        "h-7 rounded-md px-3 text-[12.5px] font-semibold text-foreground transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-accent-active coarse:h-11",
                                        cycle === c && "bg-muted",
                                    )}
                                >
                                    {c === "month"
                                        ? "Monthly"
                                        : `Yearly · ${yearly.freeMonths} months free`}
                                </button>
                            ))}
                        </div>
                    ) : null}
                </div>
                {rows === null ? (
                    <FailedState
                        title="Saroh's plans couldn't be loaded"
                        description="Your plan hasn't changed. Try again in a moment to see the others."
                        action={<RefreshButton />}
                        className="rounded-none border-0 py-8 sm:py-8"
                    />
                ) : (
                    shown.map((row, i) => (
                        <div
                            key={row.planId}
                            className={cn(
                                "flex flex-wrap items-center gap-3 px-[18px] py-[13px]",
                                i > 0 && "border-t border-border/70",
                                row.current && "bg-muted/50",
                            )}
                        >
                            <div className="min-w-0 flex-[1_1_240px]">
                                <p className="text-[14px] font-semibold">
                                    {row.name}{" "}
                                    <span className="font-medium text-foreground/80">
                                        {row.price}
                                    </span>
                                </p>
                                <p className="mt-0.5 text-[12px] text-muted-foreground">
                                    {row.what}
                                </p>
                            </div>
                            {row.current ? (
                                <span className="text-[12.5px] font-semibold text-foreground/80">
                                    Current plan
                                </span>
                            ) : row.cta && canChange ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    aria-label={`${row.cta}: ${row.name}`}
                                    onClick={() =>
                                        setPicked({
                                            planId: row.planId,
                                            name: row.name,
                                            cycle,
                                        })
                                    }
                                >
                                    {row.cta}
                                </Button>
                            ) : null}
                        </div>
                    ))
                )}
            </section>

            {addons}

            {canChange ? (
                <section
                    aria-label="Coupon"
                    className={cn(card, "grid gap-2 px-[18px] py-3.5")}
                >
                    <span className="font-display text-[15px] font-semibold">
                        Coupon
                    </span>
                    {coupon ? (
                        <div className="flex flex-wrap items-center gap-2.5">
                            <span className="font-mono text-[13px] font-semibold">
                                {coupon} · used with the plan you choose above
                            </span>
                            <button
                                type="button"
                                onClick={() => {
                                    setCoupon("");
                                    setCouponErr("");
                                }}
                                className="rounded-sm text-[12.5px] font-semibold text-foreground/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:text-muted-foreground"
                            >
                                Remove
                            </button>
                        </div>
                    ) : null}
                    {!coupon || couponErr ? (
                        <form
                            className="flex flex-wrap items-center gap-2"
                            onSubmit={(e) => {
                                e.preventDefault();
                                apply();
                            }}
                        >
                            <Input
                                value={couponIn}
                                onChange={(e) => {
                                    setCouponIn(e.target.value);
                                    setCouponErr("");
                                }}
                                placeholder="Code"
                                aria-label="Coupon code"
                                aria-invalid={couponErr ? true : undefined}
                                aria-describedby={
                                    couponErr ? "coupon-error" : undefined
                                }
                                maxLength={32}
                                autoComplete="off"
                                className="h-[34px] w-[180px] bg-muted/50 font-mono text-[13px] uppercase coarse:h-11"
                            />
                            <Button type="submit" variant="outline" size="sm">
                                Apply
                            </Button>
                            {couponErr ? (
                                <span
                                    id="coupon-error"
                                    role="alert"
                                    className="text-[12.5px] text-destructive"
                                >
                                    {couponErr}
                                </span>
                            ) : null}
                        </form>
                    ) : null}
                </section>
            ) : null}

            <ChangePlanDialog
                picked={picked}
                coupon={coupon}
                onCouponRefused={(error) => {
                    setCouponErr(error);
                    setCoupon("");
                }}
                onClose={() => setPicked(null)}
            />
        </>
    );
}
