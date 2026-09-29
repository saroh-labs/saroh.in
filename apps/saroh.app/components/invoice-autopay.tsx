"use client";

import type { AutopayMethod, AutopayStart } from "@saroh/site-blocks";
import {
    autopayCheckBefore,
    AutopayMethodChoice,
    autopayWith,
    ctaClasses,
    destructiveAlertClasses,
    landOnBusinessSite,
    openAutopayWindow,
    openProviderCheckout,
    PayOption,
} from "@saroh/site-blocks";
import { cn } from "@saroh/ui/lib/utils";
import { useRef, useState } from "react";

import { startAutopay, startPayment } from "@/app/pay/[token]/actions";
import type { PayAutopay } from "@/lib/invoice-pay-shape";

/**
 * Autopay on an invoice's pay link (round-2 D12): "Pay and turn on autopay",
 * the default, beside "Just pay this invoice", and how autopay pays — every
 * method the business's provider offers, by its plain name (DEC-059).
 *
 * UPI and card: one provider window pays the invoice and authorises. eMandate:
 * the invoice is paid first, then autopay is authorised (nothing taken). Once
 * approved, the customer lands on the page on the business's own site that
 * says how autopay stands, never on Saroh's or the provider's. An invoice
 * already paid offers "Turn on autopay" alone; by UPI or card that takes a
 * ₹1 check, refunded straight away, and says so first (D12B, DEC-064).
 *
 * Styled in the business's `--site-*` tokens, never Saroh's brand.
 */
export function InvoiceAutopay({
    token,
    autopay,
    businessName,
    billedTo,
    total,
    payable,
    onJustPay,
    justPayBusy,
    apiUrl,
}: {
    token: string;
    autopay: PayAutopay;
    businessName: string;
    billedTo: string | null;
    /** "₹1,400.00" */
    total: string;
    /** The invoice can still be paid; false: it is paid already. */
    payable: boolean;
    /** The page's own Pay, for "Just pay this invoice". */
    onJustPay: () => void;
    justPayBusy: boolean;
    /**
     * The public API the window's return is posted to (P1), so the payment
     * is settled without waiting for the webhook.
     */
    apiUrl?: string;
}) {
    const [autopayOn, setAutopayOn] = useState(true);
    const [method, setMethod] = useState<AutopayMethod | null>(
        autopay.methods[0] ?? null,
    );
    const [busy, setBusy] = useState(false);
    const [said, setSaid] = useState<string | null>(null);
    const [problem, setProblem] = useState<string | null>(null);
    // One key per visit for each step, so a double tap starts one of each.
    const keys = useRef({ pay: newKey(), autopay: newKey() });

    if (autopay.on) {
        return (
            <p
                role="status"
                className="rounded-xl border border-site-border bg-site-surface p-4 text-sm text-site-body"
            >
                Autopay is on for {autopay.plan} with {autopayWith(autopay.on)}.
            </p>
        );
    }
    if (autopay.methods.length === 0) return null;

    const request = {
        openCheckout: openProviderCheckout,
        business: businessName,
        description: `Autopay for ${autopay.plan}`,
        booker: { name: billedTo ?? "", email: "" },
        apiUrl,
    };

    function after(outcome: string, start: AutopayStart) {
        if (outcome === "redirected") return;
        if (outcome === "paid" && landOnBusinessSite(start)) return;
        setBusy(false);
        keys.current.autopay = newKey();
        if (outcome === "paid") {
            setSaid(
                "Autopay is being confirmed. Use “Check again” in a moment.",
            );
        } else if (outcome === "closed") {
            setSaid("The window closed before autopay was set up.");
        } else {
            setProblem(
                outcome === "failed"
                    ? "Autopay wasn't set up. Try again, or pick another way."
                    : "We couldn't open the payment window. Try again in a moment.",
            );
        }
    }

    async function authorise(chosen: AutopayMethod) {
        const started = await startAutopay(token, chosen, keys.current.autopay);
        if (!started.ok) {
            setBusy(false);
            setProblem(started.message);
            return;
        }
        after(await openAutopayWindow(started.data, request), started.data);
    }

    async function submit() {
        if (!method || busy) return;
        setBusy(true);
        setSaid(null);
        setProblem(null);
        // eMandate takes nothing: the invoice is paid first, as usual.
        if (method === "EMANDATE" && payable) {
            const intent = await startPayment(token, keys.current.pay);
            if (!intent.ok) {
                setBusy(false);
                setProblem(intent.message);
                return;
            }
            const paid = await openProviderCheckout({
                handoff: intent.intent,
                business: businessName,
                description: autopay.plan,
                booker: request.booker,
                apiUrl,
            }).outcome;
            if (paid !== "paid") {
                setBusy(false);
                setSaid(
                    paid === "closed"
                        ? "The window closed before you paid."
                        : "The payment didn't go through. Try again.",
                );
                return;
            }
        }
        await authorise(method);
    }

    const off = busy || method === null;
    // Nothing owed: UPI and card take the ₹1 check, refunded (DEC-064).
    const check = !payable && method ? (autopay.checks[method] ?? null) : null;
    const cta = busy
        ? "Opening…"
        : !payable
          ? "Turn on autopay"
          : method === "EMANDATE"
            ? `Pay ${total}, then set up autopay`
            : `Pay ${total} and turn on autopay`;

    return (
        <div className="space-y-3">
            {payable ? (
                <div
                    role="radiogroup"
                    aria-label="How to pay"
                    className="grid gap-2"
                >
                    <PayOption
                        on={autopayOn}
                        label={`Pay ${total} and turn on autopay`}
                        sub={`Each renewal of ${autopay.plan} is paid automatically.`}
                        onPick={() => setAutopayOn(true)}
                    />
                    <PayOption
                        on={!autopayOn}
                        label="Just pay this invoice"
                        sub="Each renewal comes with a link to pay, as this one did."
                        onPick={() => setAutopayOn(false)}
                    />
                </div>
            ) : (
                <p className="text-sm text-site-body">
                    Turn on autopay, and each renewal of {autopay.plan} is paid
                    automatically.
                </p>
            )}
            {autopayOn || !payable ? (
                <AutopayMethodChoice
                    methods={autopay.methods}
                    chosen={method}
                    onPick={setMethod}
                />
            ) : null}
            {check ? (
                <p className="text-sm text-site-body">
                    {autopayCheckBefore(check)}
                </p>
            ) : null}
            {said ? (
                <p role="status" className="text-sm text-site-body">
                    {said}
                </p>
            ) : null}
            {problem ? (
                <p role="alert" className={destructiveAlertClasses}>
                    {problem}
                </p>
            ) : null}
            {autopayOn || !payable ? (
                <button
                    type="button"
                    onClick={() => void submit()}
                    disabled={off}
                    className={cn(
                        ctaClasses("primary"),
                        "w-full disabled:cursor-not-allowed disabled:opacity-60",
                    )}
                >
                    {cta}
                </button>
            ) : (
                <button
                    type="button"
                    onClick={onJustPay}
                    disabled={justPayBusy}
                    className={cn(
                        ctaClasses("primary"),
                        "w-full disabled:cursor-not-allowed disabled:opacity-60",
                    )}
                >
                    {justPayBusy ? "Starting payment…" : `Pay ${total}`}
                </button>
            )}
        </div>
    );
}

function newKey(): string {
    return typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);
}
