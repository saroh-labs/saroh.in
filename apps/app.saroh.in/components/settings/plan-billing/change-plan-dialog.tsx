"use client";

import { Button } from "@saroh/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@saroh/ui/dialog";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { Skeleton } from "@saroh/ui/skeleton";
import { showError, showSuccess } from "@saroh/ui/toast";
import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { OptionSelect } from "@/components/shared/option-select";
import { ViewerDate } from "@/components/shared/viewer-date";
import { formatShortDate } from "@/lib/format/datetime";
import { GST_STATES } from "@/lib/invoices/gst";
import {
    changePlanAction,
    quoteChangeAction,
} from "@/lib/saroh-billing/billing-actions";
import type { ChangeQuote, Cycle } from "@/lib/saroh-billing/plan-view";
import { quoteSummary } from "@/lib/saroh-billing/quote-words";
import { openRazorpayWindow } from "@/lib/saroh-billing/razorpay-window";

import { useCheckoutConfirm } from "./use-checkout-confirm";

/** The plan picked: which, on which cycle, and what the row's button said. */
export interface PickedPlan {
    planId: string;
    name: string;
    cycle: Cycle;
}

type Quoting =
    | { state: "loading" }
    | { state: "ready"; quote: ChangeQuote }
    | { state: "failed"; error: string };

/** A quote's answer, for the request it answers. */
type Answer =
    | { key: string; state: "ready"; quote: ChangeQuote }
    | { key: string; state: "failed"; error: string };

const STATE_OPTIONS = [
    { value: "", label: "As on the business's details" },
    ...GST_STATES,
];

/**
 * Changing plan (U15–U17), after a row on the picker: the API's quote first
 * — what kind of change, when, and every amount, in DEC-093's honest words
 * — then Confirm, then Razorpay's own window over the page, with the
 * owner's details pre-filled. Nothing is charged until the owner pays
 * there; a move to Free needs no payment. Paying brings the dialog back as
 * "Confirming your payment…" while the API checks with Razorpay (UX-003);
 * the plan moves as soon as Razorpay says so, webhook or not. Where the
 * window can't open, the provider's page link is the fallback. The coupon held on the Coupon card
 * goes with the quote; one the API refuses is said here, with a way on
 * without it.
 *
 * The design moves plan on a click; real money asks first (design
 * deviation, U14).
 */
export function ChangePlanDialog({
    picked,
    coupon,
    currentPlan,
    onCouponRefused,
    onClose,
}: {
    picked: PickedPlan | null;
    coupon: string;
    /** The plan the business is on now, for "you stay on …". */
    currentPlan: string;
    /** The coupon couldn't be used: the Coupon card shows why. */
    onCouponRefused: (error: string) => void;
    onClose: () => void;
}) {
    const router = useRouter();
    // Paying: hidden while Razorpay's window is up (a dialog over it would
    // trap its focus), then back to say it's confirming.
    const [paying, setPaying] = useState<"no" | "away" | "confirming">("no");
    const { phase, confirm: confirmPaid } = useCheckoutConfirm(
        picked?.name ?? "",
    );
    const [answer, setAnswer] = useState<Answer | null>(null);
    const [dropped, setDropped] = useState<{
        code: string;
        error: string;
    } | null>(null);
    const [billingState, setBillingState] = useState("");
    const [gstin, setGstin] = useState("");
    const [gstinError, setGstinError] = useState<string | null>(null);
    const [pending, start] = useTransition();
    const [attempt, setAttempt] = useState(0);

    const code = coupon;
    const key = picked
        ? `${picked.planId}:${picked.cycle}:${code}:${attempt}`
        : "";
    // Loading until the answer for this very request has landed.
    const quoting: Quoting =
        answer?.key === key && key ? answer : { state: "loading" };

    useEffect(() => {
        if (!picked) return;
        let live = true;
        void quoteChangeAction({
            plan: picked.planId,
            cycle: picked.cycle,
            coupon: code || undefined,
        }).then((res) => {
            if (!live) return;
            if (res.ok) {
                setAnswer({ key, state: "ready", quote: res.data });
            } else if (res.field === "coupon" && code) {
                // Quoted again without it: the parent clears the code.
                setDropped({ code, error: res.error });
                onCouponRefused(res.error);
            } else {
                setAnswer({ key, state: "failed", error: res.error });
            }
        });
        return () => {
            live = false;
        };
        // onCouponRefused is the card's setter; a new one each render.
        // `key` stands for picked, code and attempt.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    const summary =
        quoting.state === "ready"
            ? quoteSummary(quoting.quote, { currentPlan })
            : null;

    function confirm() {
        if (!picked || quoting.state !== "ready") return;
        const g = gstin.trim().toUpperCase();
        if (g && !/^[0-9A-Z]{15}$/.test(g)) {
            setGstinError("A GSTIN is 15 characters.");
            return;
        }
        start(async () => {
            const res = await changePlanAction({
                plan: picked.planId,
                cycle: picked.cycle,
                coupon: code || undefined,
                billingState: billingState || undefined,
                gstin: g || undefined,
            });
            if (!res.ok) {
                if (res.field === "gstin") setGstinError(res.error);
                else if (res.field === "coupon" && code) {
                    setDropped({ code, error: res.error });
                    onCouponRefused(res.error);
                } else showError(res.error);
                return;
            }
            if (res.data.kind === "TO_FREE") {
                const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
                const on = new Date(res.data.effectiveAt) > new Date();
                showSuccess(
                    on
                        ? `You'll move to ${picked.name} on ${formatShortDate(res.data.effectiveAt, zone)}. Everything stays until then.`
                        : `You're on ${picked.name} from today.`,
                );
                onClose();
                router.refresh();
                return;
            }
            if (res.data.handoff) {
                setPaying("away");
                const outcome = await openRazorpayWindow(
                    res.data.handoff,
                    `${picked.name}, ${picked.cycle === "year" ? "yearly" : "monthly"}`,
                );
                if (outcome === "paid") {
                    setPaying("confirming");
                    const state = await confirmPaid(8);
                    if (state !== "waiting") {
                        setPaying("no");
                        onClose();
                    }
                    return;
                }
                if (outcome === "closed") {
                    // Kept: "Your plan" offers to continue the same payment.
                    setPaying("no");
                    onClose();
                    router.refresh();
                    return;
                }
                setPaying("no");
            }
            if (!res.data.authorisationUrl) {
                showError(
                    "Razorpay's payment window couldn't open, so nothing was charged.",
                    "Your plan change is kept under Your plan: continue it from there.",
                );
                onClose();
                router.refresh();
                return;
            }
            // Given once and kept nowhere: straight to the browser.
            window.location.assign(res.data.authorisationUrl);
        });
    }

    if (paying === "confirming") {
        const still = phase === "waiting";
        return (
            <Dialog
                open={picked !== null}
                onOpenChange={(open) => {
                    if (!open && still) {
                        setPaying("no");
                        onClose();
                        router.refresh();
                    }
                }}
            >
                <DialogContent className="max-w-[480px]">
                    <DialogHeader className="text-left">
                        <DialogTitle className="font-display text-[17px] font-semibold tracking-[-0.02em]">
                            {still
                                ? "Razorpay hasn't told us yet"
                                : "Confirming your payment…"}
                        </DialogTitle>
                        <DialogDescription className="text-pretty text-[13px] leading-[1.55] text-foreground/80">
                            {still
                                ? `If you paid, ${picked?.name ?? "the plan"} switches on as soon as Razorpay tells us — you don't need to pay again. Your plan shows it while it's waiting.`
                                : `Checking with Razorpay, then switching you to ${picked?.name ?? "the plan"}. This takes a few seconds.`}
                        </DialogDescription>
                    </DialogHeader>
                    {still ? null : (
                        <div
                            role="status"
                            aria-live="polite"
                            className="flex items-center gap-2 text-[13px] text-muted-foreground"
                        >
                            <LoaderCircle
                                aria-hidden
                                className="size-4 animate-spin motion-reduce:animate-none"
                            />
                            Confirming with Razorpay
                        </div>
                    )}
                    {still ? (
                        <DialogFooter className="gap-2 sm:space-x-0">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => void confirmPaid(3)}
                            >
                                Check again
                            </Button>
                            <Button
                                type="button"
                                onClick={() => {
                                    setPaying("no");
                                    onClose();
                                    router.refresh();
                                }}
                            >
                                Done
                            </Button>
                        </DialogFooter>
                    ) : null}
                </DialogContent>
            </Dialog>
        );
    }

    return (
        <Dialog
            open={picked !== null && paying === "no"}
            onOpenChange={(open) => {
                if (!open && !pending) onClose();
            }}
        >
            <DialogContent className="max-w-[480px]">
                <DialogHeader className="text-left">
                    <DialogTitle className="font-display text-[17px] font-semibold tracking-[-0.02em]">
                        {summary?.title ?? `Change to ${picked?.name ?? ""}`}
                    </DialogTitle>
                    <DialogDescription className="text-pretty text-[13px] leading-[1.55] text-foreground/80">
                        {quoting.state === "loading"
                            ? "Working out the price…"
                            : quoting.state === "failed"
                              ? quoting.error
                              : summary?.lead}
                    </DialogDescription>
                </DialogHeader>

                {quoting.state === "loading" ? (
                    <div
                        aria-busy="true"
                        aria-label="Working out the price"
                        className="grid gap-2"
                    >
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-4 w-2/3" />
                        <Skeleton className="h-4 w-1/2" />
                    </div>
                ) : null}

                {summary && summary.lines.length > 0 ? (
                    <dl className="grid gap-0 overflow-hidden rounded-lg border border-border text-[13px]">
                        {summary.lines.map((l, i) => (
                            <div
                                key={l.label}
                                className={
                                    "grid grid-cols-1 gap-1 px-3.5 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4" +
                                    (i > 0 ? " border-t border-border/70" : "")
                                }
                            >
                                <dt className="text-muted-foreground">
                                    {l.label}
                                </dt>
                                <dd className="m-0 font-medium tabular-nums sm:text-right">
                                    {l.iso ? (
                                        <ViewerDate iso={l.iso} />
                                    ) : (
                                        l.value
                                    )}
                                </dd>
                            </div>
                        ))}
                    </dl>
                ) : null}

                {dropped ? (
                    <p role="note" className="text-[12.5px] text-foreground/80">
                        Coupon {dropped.code} can&apos;t be used here:{" "}
                        {dropped.error} This is the price without it.
                    </p>
                ) : null}

                {summary?.toPayment ? (
                    <details className="group rounded-lg border border-border px-3.5 py-2.5 text-[13px]">
                        <summary className="cursor-pointer font-semibold">
                            Details for Saroh&apos;s invoice (optional)
                        </summary>
                        <div className="mt-3 grid gap-3">
                            <div className="grid gap-1.5">
                                <Label htmlFor="bill-state">
                                    State your business is registered in
                                </Label>
                                <OptionSelect
                                    id="bill-state"
                                    value={billingState}
                                    onValueChange={setBillingState}
                                    options={STATE_OPTIONS}
                                />
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="bill-gstin">GSTIN</Label>
                                <Input
                                    id="bill-gstin"
                                    value={gstin}
                                    onChange={(e) => {
                                        setGstin(e.target.value);
                                        setGstinError(null);
                                    }}
                                    maxLength={15}
                                    autoComplete="off"
                                    className="font-mono uppercase"
                                    aria-invalid={gstinError ? true : undefined}
                                    aria-describedby={
                                        gstinError
                                            ? "bill-gstin-error"
                                            : undefined
                                    }
                                />
                                {gstinError ? (
                                    <p
                                        id="bill-gstin-error"
                                        role="alert"
                                        className="text-[12.5px] text-destructive"
                                    >
                                        {gstinError}
                                    </p>
                                ) : (
                                    <p className="text-[12px] text-muted-foreground">
                                        Leave it empty if the business has none.
                                    </p>
                                )}
                            </div>
                        </div>
                    </details>
                ) : null}

                <DialogFooter className="gap-2 sm:space-x-0">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onClose}
                        disabled={pending}
                    >
                        {summary?.confirm ? "Cancel" : "Close"}
                    </Button>
                    {quoting.state === "failed" ? (
                        <Button
                            type="button"
                            onClick={() => setAttempt((n) => n + 1)}
                        >
                            Try again
                        </Button>
                    ) : summary?.confirm ? (
                        <Button
                            type="button"
                            onClick={confirm}
                            disabled={pending}
                        >
                            {pending
                                ? summary.toPayment
                                    ? "Opening the payment…"
                                    : "Changing…"
                                : summary.confirm}
                        </Button>
                    ) : null}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
