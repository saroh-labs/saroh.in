"use client";

import { submitOnModEnter } from "@/lib/hooks/keyboard-save";
import { formatInr } from "@saroh/pricing-catalog";
import { Button } from "@saroh/ui/button";
import { FailedState } from "@saroh/ui/data-state";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { TextLink } from "@saroh/ui/text-link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState, useTransition } from "react";

import { MARKETING_URL } from "@/lib/help/links";
import type { CouponCheck } from "@/lib/saroh-billing/billing-actions";
import { checkCouponAction } from "@/lib/saroh-billing/billing-actions";
import type { Cycle, PickerRow } from "@/lib/saroh-billing/plan-view";
import { couldntLoad, nothingChanged } from "@saroh/ui/lib/state-copy";

import { runAction } from "@/lib/api/run-action";
import { Segmented } from "@saroh/ui/segmented";
import type { PickedPlan } from "./change-plan-dialog";
import { ChangePlanDialog } from "./change-plan-dialog";
import { PlanCard } from "./plan-card";
import { RefreshButton } from "./refresh-button";
import { card } from "./styles";

/**
 * Side by side once the section has room for every card (about 250px
 * each), as many columns as there are plans; stacked below that. The
 * section's own width decides, not the window's: the menu and the Settings
 * list beside it take a third of a laptop's screen. `PlanCard` joins the
 * shared rows at the same widths (`SHARED_ROWS`).
 */
const COLUMNS: Record<number, string> = {
    1: "",
    2: "[@container(min-width:500px)]:grid-cols-2 [@container(min-width:500px)]:gap-y-0",
    3: "[@container(min-width:750px)]:grid-cols-3 [@container(min-width:750px)]:gap-y-0",
    4: "[@container(min-width:1000px)]:grid-cols-4 [@container(min-width:1000px)]:gap-y-0",
};

/**
 * The plans, add-ons and coupon on Settings › Plan and billing: Monthly |
 * Yearly when the catalogue offers yearly, then the plans as cards side by
 * side (`PlanCard`; owner, 13 Oct 2026), each with its price, who it's
 * for, a button that says what it does and when (DEC-159: "Upgrade to
 * ‹plan›" starts today, "Move to ‹plan› from ‹date›" waits) and every line
 * of what it unlocks (the catalogue's card lines, UX-045). Under them, the
 * way to the full comparison on the pricing page and `foot` ("How billing
 * works"). Then the Add-ons card and the Coupon card, whose code is
 * checked on Apply (UX-046) and goes with the next change's quote. Picking
 * a plan opens the change (`ChangePlanDialog`).
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
    foot,
    currentPlan,
}: {
    /** Per cycle; null when Saroh's price list couldn't be read. */
    rows: Record<Cycle, PickerRow[]> | null;
    yearly: { on: false } | { on: true; freeMonths: number };
    initialCycle: Cycle;
    /** `billing:manage`: who may change the plan. */
    canChange: boolean;
    /** The Add-ons card, between the picker and the coupon, as drawn. */
    addons: ReactNode;
    /** Under the plans: "How billing works". */
    foot?: ReactNode;
    /** The plan it's on now, for the quote's "you stay on …". */
    currentPlan: string;
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
    const [checked, setChecked] = useState<CouponCheck | null>(null);
    const [checking, startCheck] = useTransition();

    const shown = rows?.[cycle] ?? [];

    // An "Upgrade" from elsewhere in the app (`?plan=&cycle=`): open that
    // plan's change once per arrival — adjusted while rendering, as React
    // does for state that follows a prop — then tidy the address.
    const wanted = search.get("plan");
    const [arrived, setArrived] = useState<string | null>(null);
    const arrival = wanted ? search.toString() : null;
    if (arrival !== null && arrival !== arrived && rows && canChange) {
        setArrived(arrival);
        const want: Cycle =
            search.get("cycle") === "year" && yearly.on ? "year" : cycle;
        const row = rows[want].find((r) => r.planId === wanted);
        if (row) {
            setCycle(want);
            setPicked({ planId: row.planId, name: row.name, cycle: want });
        }
    }
    // Tidied away: the same link may open it again later.
    if (arrival === null && arrived !== null) setArrived(null);
    useEffect(() => {
        if (wanted)
            router.replace(`${pathname}#change-plan`, { scroll: false });
    }, [wanted, pathname, router]);

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
        // Checked now, against the paid plans on offer here (UX-046).
        const plans = shown
            .filter((r) => r.cta !== null && r.price !== "₹0")
            .map((r) => r.planId);
        startCheck(async () => {
            const res = await runAction(() =>
                checkCouponAction({ code, cycle, plans }),
            );
            if (!res) return;
            if (!res.ok) {
                setCouponErr(res.error);
                return;
            }
            setChecked(res.data);
            setCoupon(res.data.code);
            setCouponIn("");
            setCouponErr("");
        });
    }

    return (
        <>
            <section
                id="change-plan"
                aria-label="Change plan"
                className="grid scroll-mt-4 gap-3 [container-type:inline-size]"
            >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <div className="min-w-0 flex-[1_1_260px]">
                        <h2 className="font-display text-[17px] font-semibold">
                            Plans
                        </h2>
                        {canChange ? null : (
                            <p className="mt-0.5 text-[13px] text-foreground/80">
                                These are Saroh&apos;s plans and what each is
                                for.
                            </p>
                        )}
                    </div>
                    {yearly.on && rows ? (
                        <Segmented
                            label="Billing"
                            value={cycle}
                            onValueChange={setCycle}
                            options={[
                                { value: "month", label: "Monthly" },
                                {
                                    value: "year",
                                    label: `Yearly · ${yearly.freeMonths} months free`,
                                },
                            ]}
                        />
                    ) : null}
                </div>
                {rows === null ? (
                    <FailedState
                        size="panel"
                        title={couldntLoad("Saroh's plans")}
                        description={nothingChanged("Your plan is as it was.")}
                        action={<RefreshButton />}
                        className={card}
                    />
                ) : (
                    <ul
                        className={cn(
                            "grid gap-3",
                            COLUMNS[shown.length] ?? COLUMNS[3],
                        )}
                    >
                        {shown.map((row) => (
                            <PlanCard
                                key={row.planId}
                                row={row}
                                beside={shown.length}
                                canChange={canChange}
                                onPick={() =>
                                    setPicked({
                                        planId: row.planId,
                                        name: row.name,
                                        cycle,
                                    })
                                }
                            />
                        ))}
                    </ul>
                )}
                <p className="text-center text-[13px]">
                    <TextLink href={`${MARKETING_URL}/pricing`} external>
                        Compare everything on the pricing page
                    </TextLink>
                </p>
                {foot}
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
                            <span className="text-[13px]">
                                <span className="font-mono font-semibold">
                                    {coupon}
                                </span>
                                {checked
                                    ? ` · ${formatInr(checked.discountPaise)} off ${
                                          checked.cycle === "year"
                                              ? "the first yearly charge"
                                              : checked.charges === 1
                                                ? "the first month"
                                                : `each of the first ${checked.charges} months`
                                      } of ${checked.planName}, before GST. Used when you start a paid plan above.`
                                    : " · used with the plan you choose above"}
                            </span>
                            <Button
                                variant="link"
                                size="inline"
                                type="button"
                                onClick={() => {
                                    setCoupon("");
                                    setChecked(null);
                                    setCouponErr("");
                                }}
                            >
                                Remove
                            </Button>
                        </div>
                    ) : null}
                    {!coupon || couponErr ? (
                        <form
                            onKeyDown={submitOnModEnter}
                            className="flex flex-wrap items-center gap-2"
                            onSubmit={(e) => {
                                e.preventDefault();
                                apply();
                            }}
                        >
                            <Input
                                dense
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
                                className="w-[180px] bg-muted/50 font-mono uppercase"
                            />
                            <Button
                                type="submit"
                                variant="outline"
                                size="sm"
                                busy={checking}
                                busyLabel="Checking…"
                            >
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
                // A fresh dialog per plan picked: its coupon note, invoice
                // details and quote start over.
                key={picked ? `${picked.planId}:${picked.cycle}` : "closed"}
                picked={picked}
                coupon={coupon}
                currentPlan={currentPlan}
                onCouponRefused={(error) => {
                    setCouponErr(error);
                    setCoupon("");
                    setChecked(null);
                }}
                onClose={() => setPicked(null)}
            />
        </>
    );
}
