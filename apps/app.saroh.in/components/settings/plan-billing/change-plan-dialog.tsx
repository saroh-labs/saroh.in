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
import { Field, focusFirstError } from "@saroh/ui/field";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { Skeleton } from "@saroh/ui/skeleton";
import { showError, showSuccess } from "@saroh/ui/toast";
import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { ViewerDate } from "@/components/shared/viewer-date";
import { GST_STATES } from "@/lib/invoices/gst";
import {
    changePlanAction,
    quoteChangeAction,
} from "@/lib/saroh-billing/billing-actions";
import type { ChangeQuote, Cycle } from "@/lib/saroh-billing/plan-view";
import {
    endingAddonsNote,
    quoteSummary,
} from "@/lib/saroh-billing/quote-words";
import { openRazorpayWindow } from "@/lib/saroh-billing/razorpay-window";
import { OptionSelect } from "@saroh/ui/option-select";

import { runAction } from "@/lib/api/run-action";
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

/** The registered address's fields, by the API's field names. */
type AddressField = "addressLine1" | "addressLine2" | "city" | "postalCode";
const ADDRESS_FIELDS: AddressField[] = [
    "addressLine1",
    "addressLine2",
    "city",
    "postalCode",
];

/**
 * What is wrong with the registered address typed at checkout, by field:
 * nothing typed is fine unless a GSTIN was given (a registered buyer's
 * invoice carries their address, CGST Rule 46(e)); anything typed needs
 * the first line, the city and a six-digit PIN, as the API asks.
 */
export function addressProblems(
    a: Record<AddressField, string>,
    gstinGiven: boolean,
): Partial<Record<AddressField, string>> {
    const line1 = a.addressLine1.trim();
    const city = a.city.trim();
    const pin = a.postalCode.replace(/\s+/g, "");
    const any = Boolean(line1 || a.addressLine2.trim() || city || pin);
    if (!any && !gstinGiven) return {};
    const out: Partial<Record<AddressField, string>> = {};
    if (!line1) {
        out.addressLine1 = gstinGiven
            ? "Add the registered address: it prints on Saroh's invoice with your GSTIN."
            : "Add the address's first line.";
    }
    if (!city) out.city = "Add the city.";
    if (!pin) out.postalCode = "Add the PIN code.";
    else if (!/^[1-9][0-9]{5}$/.test(pin)) {
        out.postalCode = "A PIN code is six digits, like 560038.";
    }
    return out;
}

const NO_ADDRESS: Record<AddressField, string> = {
    addressLine1: "",
    addressLine2: "",
    city: "",
    postalCode: "",
};

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
 * without it. Add-ons the new plan isn't offered end with the old one
 * (DEC-157): the quote names them and a note says so before Confirm.
 * When the change starts is said first (DEC-159): "Starts today" with what
 * is paid now, or "From ‹date›" with the plan kept until then.
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
    const [billingState, setBillingState] = useState("");
    const [gstin, setGstin] = useState("");
    const [gstinError, setGstinError] = useState<string | null>(null);
    const [address, setAddress] =
        useState<Record<AddressField, string>>(NO_ADDRESS);
    const [addressErrors, setAddressErrors] = useState<
        Partial<Record<AddressField, string>>
    >({});
    const detailsRef = useRef<HTMLDetailsElement>(null);
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
    // What the change takes away, said before Confirm (DEC-157).
    const endingAddons =
        quoting.state === "ready" && summary?.confirm
            ? endingAddonsNote(quoting.quote, { currentPlan })
            : null;

    // The profile has no registered address: the invoice's details ask
    // for it (an API from before the field asks nothing).
    const asksAddress =
        quoting.state === "ready" &&
        quoting.quote.registeredAddress === false &&
        Boolean(summary?.toPayment);

    /** Open the details and put the keyboard on the first field in error. */
    function showProblems() {
        if (detailsRef.current) detailsRef.current.open = true;
        requestAnimationFrame(() => focusFirstError(detailsRef.current));
    }

    function confirm() {
        if (!picked || quoting.state !== "ready") return;
        const g = gstin.trim().toUpperCase();
        if (g && !/^[0-9A-Z]{15}$/.test(g)) {
            setGstinError("A GSTIN is 15 characters.");
            showProblems();
            return;
        }
        const problems = asksAddress
            ? addressProblems(address, Boolean(g))
            : {};
        setAddressErrors(problems);
        if (Object.keys(problems).length) {
            showProblems();
            return;
        }
        const typed = asksAddress && address.addressLine1.trim();
        start(async () => {
            const res = await runAction(() =>
                changePlanAction({
                    plan: picked.planId,
                    cycle: picked.cycle,
                    coupon: code || undefined,
                    billingState: billingState || undefined,
                    gstin: g || undefined,
                    registeredAddress: typed
                        ? {
                              line1: address.addressLine1,
                              line2: address.addressLine2,
                              city: address.city,
                              postalCode: address.postalCode,
                          }
                        : undefined,
                }),
            );
            if (!res) return;
            if (!res.ok) {
                if (res.field === "gstin") {
                    setGstinError(res.error);
                    showProblems();
                } else if (
                    res.field &&
                    (ADDRESS_FIELDS as string[]).includes(res.field)
                ) {
                    setAddressErrors({
                        [res.field as AddressField]: res.error,
                    });
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

                {summary?.toPayment ? (
                    <details
                        ref={detailsRef}
                        className="group rounded-lg border border-border px-3.5 py-2.5 text-[13px]"
                    >
                        <summary className="cursor-pointer font-semibold">
                            Details for Saroh&apos;s invoice
                            {asksAddress ? null : " (optional)"}
                        </summary>
                        <div className="mt-3 grid gap-3">
                            <div className="grid gap-1.5">
                                <Label htmlFor="bill-state">
                                    State your business is registered in
                                    {asksAddress ? <Optional /> : null}
                                </Label>
                                <OptionSelect
                                    id="bill-state"
                                    value={billingState}
                                    onValueChange={setBillingState}
                                    options={STATE_OPTIONS}
                                />
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="bill-gstin">
                                    GSTIN
                                    {asksAddress ? <Optional /> : null}
                                </Label>
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
                            {asksAddress ? (
                                <CheckoutAddressFields
                                    value={address}
                                    errors={addressErrors}
                                    // Asked for with a GSTIN; optional without.
                                    optional={!gstin.trim()}
                                    onChange={(field, v) => {
                                        setAddress((a) => ({
                                            ...a,
                                            [field]: v,
                                        }));
                                        setAddressErrors((e) => {
                                            const { [field]: _gone, ...rest } =
                                                e;
                                            return rest;
                                        });
                                    }}
                                />
                            ) : null}
                        </div>
                    </details>
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
                            {summary.confirm}
                        </Button>
                    ) : null}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/** "(optional)" after a label, as `Field` writes it. */
function Optional() {
    return (
        <span className="font-normal text-muted-foreground"> (optional)</span>
    );
}

/**
 * The business's registered address, asked for when its profile has none
 * and kept there (Settings › Business shows it after): it prints on
 * Saroh's invoice, required with a GSTIN (CGST Rule 46(e)).
 */
function CheckoutAddressFields({
    value,
    errors,
    optional,
    onChange,
}: {
    value: Record<AddressField, string>;
    errors: Partial<Record<AddressField, string>>;
    optional: boolean;
    onChange: (field: AddressField, value: string) => void;
}) {
    return (
        <div
            role="group"
            aria-labelledby="bill-address-label"
            className="grid gap-3"
        >
            <div>
                <p
                    id="bill-address-label"
                    className="text-[13px] font-semibold"
                >
                    Registered address
                </p>
                <p className="text-[12px] text-muted-foreground">
                    It prints on Saroh&apos;s invoice and is saved to your
                    business details.
                </p>
            </div>
            <Field
                label="Address line 1"
                optional={optional}
                error={errors.addressLine1}
            >
                <Input
                    id="bill-address-line1"
                    value={value.addressLine1}
                    onChange={(e) => onChange("addressLine1", e.target.value)}
                    maxLength={120}
                    autoComplete="address-line1"
                />
            </Field>
            <Field label="Address line 2" optional error={errors.addressLine2}>
                <Input
                    id="bill-address-line2"
                    value={value.addressLine2}
                    onChange={(e) => onChange("addressLine2", e.target.value)}
                    maxLength={120}
                    autoComplete="address-line2"
                />
            </Field>
            <div className="grid grid-cols-2 gap-3">
                <Field label="City" optional={optional} error={errors.city}>
                    <Input
                        id="bill-city"
                        value={value.city}
                        onChange={(e) => onChange("city", e.target.value)}
                        maxLength={60}
                        autoComplete="address-level2"
                    />
                </Field>
                <Field
                    label="PIN code"
                    optional={optional}
                    error={errors.postalCode}
                >
                    <Input
                        id="bill-pin"
                        value={value.postalCode}
                        onChange={(e) => onChange("postalCode", e.target.value)}
                        maxLength={12}
                        inputMode="numeric"
                        autoComplete="postal-code"
                    />
                </Field>
            </div>
        </div>
    );
}
