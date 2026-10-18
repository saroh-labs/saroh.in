"use client";

import { formatDate, viewerTimeZone } from "@/lib/format/datetime";
import { Button } from "@saroh/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@saroh/ui/dialog";
import { focusFirstError } from "@saroh/ui/field";
import { Skeleton } from "@saroh/ui/skeleton";
import { showError, showSuccess } from "@saroh/ui/toast";
import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { ViewerDate } from "@/components/shared/viewer-date";
import type { BusinessBillingProfile } from "@/lib/billing-profiles/view";
import type { ProfileRefusal } from "@/lib/saroh-billing/billing-actions";
import {
    billingProfileViewAction,
    changePlanAction,
    quoteChangeAction,
} from "@/lib/saroh-billing/billing-actions";
import type { ChangeQuote, Cycle } from "@/lib/saroh-billing/plan-view";
import {
    endingAddonsNote,
    quoteSummary,
} from "@/lib/saroh-billing/quote-words";
import { openRazorpayWindow } from "@/lib/saroh-billing/razorpay-window";

import { runAction } from "@/lib/api/run-action";
import { ChangeBillingProfileSheet } from "./billing-profile-sheets";
import type {
    DetailErrors,
    DetailField,
    DetailsAsked,
    DetailsDraft,
} from "./invoice-details";
import {
    DETAIL_FIELDS,
    detailsAsked,
    detailsProblems,
    detailsSent,
    EMPTY_DETAILS,
    InvoiceDetailsFields,
    needsDetails,
} from "./invoice-details";
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

export { addressProblems } from "./invoice-details";

const NOTHING_ASKED: DetailsAsked = {
    name: false,
    email: false,
    address: false,
    state: false,
    phone: false,
};

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
 * without it. Add-ons the new plan isn't offered end with the old one
 * (DEC-157): the quote names them and a note says so before Confirm.
 * When the change starts is said first (DEC-159): "Starts today" with what
 * is paid now, or "From ‹date›" with the plan kept until then. Who Saroh
 * bills is asked for here, before the payment opens (17 Oct 2026): what
 * the business is missing must be given, never by a trip to Settings
 * (`invoice-details.tsx`). A business with no billing profile yet
 * (DEC-167) is asked who Saroh bills in Plan & billing's own sheet, opened
 * over the dialog, and quoted again once one is chosen: never a raw
 * refusal. What is given here may change the billing profile, so it asks
 * as Plan & billing's Edit does (owner, 18 Oct 2026): a profile billing
 * several businesses says "This changes Saroh's invoices for N
 * businesses." and Confirm becomes "Save for N businesses and continue",
 * which sends it again confirmed; another owner's profile can't be
 * changed here, and "Choose one of my profiles" opens the Change sheet.
 * What was typed stays.
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
    onChanged,
    returnTo,
}: {
    picked: PickedPlan | null;
    coupon: string;
    /** The plan the business is on now, for "you stay on …". */
    currentPlan: string;
    /** The coupon couldn't be used: the Coupon card shows why. */
    onCouponRefused: (error: string) => void;
    onClose: () => void;
    /**
     * A change was made, or a payment for one started: where to show how
     * it stands. Left out, the page it was opened on is read again.
     */
    onChanged?: () => void;
    /** The address the browser's Back returns to from the provider's page. */
    returnTo?: string;
}) {
    const router = useRouter();
    const changed = onChanged ?? (() => router.refresh());
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
    const [details, setDetails] = useState<DetailsDraft>(EMPTY_DETAILS);
    const [detailErrors, setDetailErrors] = useState<DetailErrors>({});
    const detailsRef = useRef<HTMLDetailsElement>(null);
    const [pending, start] = useTransition();
    const [attempt, setAttempt] = useState(0);
    // Who Saroh bills, read when the business has no profile to bill.
    const [choosing, setChoosing] = useState<BusinessBillingProfile | null>(
        null,
    );
    const [loadingProfiles, setLoadingProfiles] = useState(false);
    // The API's refusal to change the billing profile, for the quote it
    // was made on: one message, in place of a toast.
    const [refused, setRefused] = useState<{
        key: string;
        error: string;
        profile: ProfileRefusal;
    } | null>(null);

    /** Open "Choose who Saroh bills" over the dialog. */
    async function chooseProfile() {
        const res = await runAction(() => billingProfileViewAction(), {
            setBusy: setLoadingProfiles,
        });
        if (!res) return;
        if (!res.ok) {
            showError(res.error);
            return;
        }
        setChoosing(res.data);
    }

    const code = coupon;
    const key = picked
        ? `${picked.planId}:${picked.cycle}:${code}:${attempt}`
        : "";
    // Loading until the answer for this very request has landed.
    const quoting: Quoting =
        answer?.key === key && key ? answer : { state: "loading" };
    // A refusal holds until the dialog is quoted again (a profile chosen).
    const profileRefused = refused?.key === key ? refused : null;
    const sharedWith =
        profileRefused?.profile.code === "profile-shared"
            ? profileRefused.profile.businesses
            : null;

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
    // What the change takes away, said before Confirm (DEC-157).
    const endingAddons =
        quoting.state === "ready" && summary?.confirm
            ? endingAddonsNote(quoting.quote, { currentPlan })
            : null;

    // Who Saroh bills (17 Oct 2026): what the business is missing must be
    // given before the payment opens; the rest is optional.
    const asked: DetailsAsked =
        quoting.state === "ready" && summary?.toPayment
            ? detailsAsked(quoting.quote)
            : NOTHING_ASKED;
    const required = needsDetails(asked);
    // No billing profile yet: one is chosen before anything else is asked.
    const noProfile =
        quoting.state === "ready" &&
        Boolean(summary?.toPayment) &&
        (quoting.quote.billingDetails?.profile === null ||
            Boolean(quoting.quote.billingDetails?.missing.includes("profile")));

    /** Open the details and put the keyboard on the first field in error. */
    function showProblems() {
        if (detailsRef.current) detailsRef.current.open = true;
        requestAnimationFrame(() => focusFirstError(detailsRef.current));
    }

    function confirm() {
        if (!picked || quoting.state !== "ready") return;
        if (noProfile) {
            void chooseProfile();
            return;
        }
        const problems = summary?.toPayment
            ? detailsProblems(details, asked)
            : {};
        setDetailErrors(problems);
        if (Object.keys(problems).length) {
            showProblems();
            return;
        }
        start(async () => {
            const res = await runAction(() =>
                changePlanAction({
                    plan: picked.planId,
                    cycle: picked.cycle,
                    coupon: code || undefined,
                    ...detailsSent(details, asked),
                    ...(sharedWith ? { confirmSharedProfile: true } : {}),
                }),
            );
            if (!res) return;
            if (!res.ok) {
                if (res.profile) {
                    setRefused({ key, error: res.error, profile: res.profile });
                } else if (res.field === "billing-profile") {
                    // Asked in place, then quoted again.
                    void chooseProfile();
                } else if (
                    res.field &&
                    (DETAIL_FIELDS as string[]).includes(res.field)
                ) {
                    setDetailErrors({ [res.field as DetailField]: res.error });
                    showProblems();
                } else if (res.field === "coupon" && code) {
                    setDropped({ code, error: res.error });
                    onCouponRefused(res.error);
                } else showError(res.error);
                return;
            }
            if (res.data.kind === "TO_FREE") {
                const zone = viewerTimeZone();
                const on = new Date(res.data.effectiveAt) > new Date();
                showSuccess(
                    on
                        ? `You'll move to ${picked.name} on ${formatDate(res.data.effectiveAt, zone)}. Everything stays until then.`
                        : `You're on ${picked.name} from today.`,
                );
                onClose();
                changed();
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
                        onChanged?.();
                    }
                    return;
                }
                if (outcome === "closed") {
                    // Kept: "Your plan" offers to continue the same payment.
                    setPaying("no");
                    onClose();
                    changed();
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
                changed();
                return;
            }
            // Given once and kept nowhere: straight to the browser. Coming
            // back lands where the payment's standing is said.
            if (returnTo) window.history.replaceState(null, "", returnTo);
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
                        changed();
                    }
                }}
            >
                <DialogContent size="md">
                    <DialogHeader>
                        <DialogTitle>
                            {still
                                ? "Razorpay hasn't told us yet"
                                : "Confirming your payment…"}
                        </DialogTitle>
                        <DialogDescription className="text-pretty text-[13px] leading-[1.55] text-foreground/80">
                            {still
                                ? `If you paid, ${picked?.name ?? "the plan"} switches on as soon as Razorpay tells us. You don't need to pay again. Your plan shows it while it's waiting.`
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
                        <DialogFooter>
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
                                    changed();
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
            <DialogContent size="md">
                <DialogHeader>
                    <DialogTitle>
                        {summary?.title ?? `Change to ${picked?.name ?? ""}`}
                    </DialogTitle>
                    <DialogDescription className="text-pretty text-[13px] leading-[1.55] text-foreground/80">
                        {quoting.state === "ready" && summary?.from ? (
                            <>
                                From <ViewerDate iso={summary.from.iso} />: you
                                keep {summary.from.keep} until then.{" "}
                            </>
                        ) : null}
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
                            // The label keeps its own words' width (up to
                            // a little over half the row) and the amount
                            // wraps beside it. A label column that may
                            // shrink to nothing breaks "Autopay" a letter a
                            // line once the amount is a sentence.
                            <div
                                key={l.label}
                                className={
                                    "grid grid-cols-[fit-content(55%)_minmax(0,1fr)] gap-4 px-3.5 py-2.5" +
                                    (i > 0 ? " border-t border-border/70" : "")
                                }
                            >
                                <dt className="text-muted-foreground">
                                    {l.label}
                                </dt>
                                <dd className="m-0 text-right font-medium tabular-nums">
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

                {endingAddons ? (
                    <p
                        role="note"
                        className="text-pretty text-[12.5px] text-foreground/80"
                    >
                        {endingAddons}
                    </p>
                ) : null}

                {dropped ? (
                    <p role="note" className="text-[12.5px] text-foreground/80">
                        Coupon {dropped.code} can&apos;t be used here:{" "}
                        {dropped.error} This is the price without it.
                    </p>
                ) : null}

                {noProfile ? (
                    <div className="grid gap-2 rounded-lg border border-border px-3.5 py-3 text-[13px]">
                        <p className="font-semibold">Choose who Saroh bills</p>
                        <p className="text-foreground/80">
                            Saroh&apos;s invoices for this business need a
                            billing profile before the payment opens.
                        </p>
                        <p>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                busy={loadingProfiles}
                                busyLabel="Opening…"
                                onClick={() => void chooseProfile()}
                            >
                                Choose who Saroh bills
                            </Button>
                        </p>
                    </div>
                ) : summary?.toPayment ? (
                    <details
                        ref={detailsRef}
                        // Open from the start when something must be given.
                        open={required || undefined}
                        className="group rounded-lg border border-border px-3.5 py-2.5 text-[13px]"
                    >
                        <summary className="cursor-pointer font-semibold">
                            Details for Saroh&apos;s invoice
                            {required ? null : " (optional)"}
                        </summary>
                        <div className="mt-3">
                            <InvoiceDetailsFields
                                asked={asked}
                                value={details}
                                errors={detailErrors}
                                onChange={(field, v) => {
                                    setDetails((d) => ({ ...d, [field]: v }));
                                    setDetailErrors((e) => {
                                        const { [field]: _gone, ...rest } = e;
                                        return rest;
                                    });
                                }}
                            />
                        </div>
                    </details>
                ) : null}

                {profileRefused ? (
                    <div
                        role="alert"
                        className="grid gap-2 rounded-lg border border-border px-3.5 py-3 text-[13px]"
                    >
                        <p className="text-pretty">{profileRefused.error}</p>
                        {profileRefused.profile.code === "profile-not-yours" ? (
                            <p>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    busy={loadingProfiles}
                                    busyLabel="Opening…"
                                    onClick={() => void chooseProfile()}
                                >
                                    Choose one of my profiles
                                </Button>
                            </p>
                        ) : null}
                    </div>
                ) : null}

                {choosing ? (
                    <ChangeBillingProfileSheet
                        view={choosing}
                        open
                        onClose={() => setChoosing(null)}
                        onSaved={() => setAttempt((n) => n + 1)}
                    />
                ) : null}

                <DialogFooter>
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
                            busy={pending}
                            busyLabel={
                                summary.toPayment
                                    ? "Opening the payment…"
                                    : "Changing…"
                            }
                        >
                            {sharedWith
                                ? `Save for ${sharedWith} businesses and continue`
                                : summary.confirm}
                        </Button>
                    ) : null}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
