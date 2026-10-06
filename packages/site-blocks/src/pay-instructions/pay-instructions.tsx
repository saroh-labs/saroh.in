"use client";

import { useEffect, useId, useRef, useState } from "react";

import { cn } from "../lib/utils";
import type { PayInstructions } from "./model";
import { groupedAccount, hasPayInstructions, qrPath, upiPayUri } from "./model";

const focusRing =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-fg focus-visible:ring-offset-2 focus-visible:ring-offset-site-bg";

export interface PayInstructionsCardProps {
    /** What the business set; nothing set draws nothing. */
    instructions: PayInstructions | null | undefined;
    /** The business, as the page names it: the payee on the QR. */
    businessName: string;
    /**
     * What is owed, as the API writes money ("1400.00"), put in the QR so
     * the customer's UPI app fills it in. Absent: they type it.
     */
    amount?: string | null;
    currency?: string;
    /** What it pays, for the UPI note: "Invoice RC-0001", "Order #1042". */
    reference?: string | null;
    /** The card's heading; "How to pay ‹business›" when absent. */
    title?: string;
    /** A line under the heading. */
    lead?: string | null;
    className?: string;
}

/**
 * "How to pay us" on a customer's own unpaid invoice, order or booking
 * (R32): the business's UPI ID as a scannable UPI QR with a copy button and,
 * on a phone, a link that opens their UPI app; bank details with a copy
 * button on each; the business's note. Only what is set is drawn, and a
 * business that set nothing gets nothing — the page keeps its own line.
 *
 * Merchant chrome in the `--site-*` layer, never Saroh's. The QR itself is
 * black on white whatever the theme: a scanner reads dark modules on a light
 * ground, and an inverted code fails in many UPI apps.
 */
export function PayInstructionsCard({
    instructions,
    businessName,
    amount,
    currency = "INR",
    reference,
    title,
    lead,
    className,
}: PayInstructionsCardProps) {
    const headingId = useId();
    if (!hasPayInstructions(instructions)) return null;
    const { upiId, bankAccountName, bankAccountNumber, bankIfsc, bankName } =
        instructions;
    const bank = bankAccountNumber && bankIfsc ? bankAccountNumber : null;
    const uri = upiId
        ? upiPayUri({
              upiId,
              payee: businessName,
              amount,
              currency,
              note: reference,
          })
        : null;

    return (
        <section
            aria-labelledby={headingId}
            className={cn(
                "border-site-border bg-site-surface text-site-body rounded-xl border p-5 text-left",
                className,
            )}
        >
            <h2
                id={headingId}
                className="font-site-heading text-site-fg text-lg font-semibold tracking-tight"
            >
                {title ?? `How to pay ${businessName}`}
            </h2>
            {lead ? (
                <p className="text-site-muted mt-1 text-sm">{lead}</p>
            ) : null}

            {upiId && uri ? (
                <div className="mt-4 flex flex-wrap items-start gap-5">
                    <UpiQr
                        uri={uri}
                        label={`UPI QR code to pay ${businessName}`}
                    />
                    <div className="min-w-0 flex-[1_1_200px]">
                        <p className="text-site-fg text-sm font-semibold">
                            Pay by UPI
                        </p>
                        <p className="text-site-muted mt-0.5 text-sm">
                            Scan the code with any UPI app
                            {amount && currency === "INR" && Number(amount) > 0
                                ? "; the amount fills in."
                                : ", or pay this UPI ID."}
                        </p>
                        <CopyRow label="UPI ID" value={upiId} />
                        {/* On a phone the code is on the same screen: open the app instead. */}
                        <a
                            href={uri}
                            className={cn(
                                "border-site-border text-site-fg mt-3 inline-flex h-11 items-center rounded-lg border px-4 text-sm font-semibold sm:hidden",
                                focusRing,
                            )}
                        >
                            Open in a UPI app
                        </a>
                    </div>
                </div>
            ) : null}

            {bank && bankIfsc ? (
                <div
                    className={cn(
                        "mt-4",
                        upiId && "border-site-border border-t pt-4",
                    )}
                >
                    <p className="text-site-fg text-sm font-semibold">
                        Pay by bank transfer
                    </p>
                    <dl className="mt-1">
                        {bankAccountName ? (
                            <Fact
                                label="Account name"
                                value={bankAccountName}
                            />
                        ) : null}
                        <CopyRow
                            label="Account number"
                            spoken="account number"
                            value={bank}
                            shown={groupedAccount(bank)}
                            mono
                            asFact
                        />
                        <CopyRow label="IFSC" value={bankIfsc} mono asFact />
                        {bankName ? (
                            <Fact label="Bank" value={bankName} />
                        ) : null}
                    </dl>
                </div>
            ) : null}

            {instructions.note ? (
                <p
                    className={cn(
                        "text-site-body mt-4 whitespace-pre-line text-sm [overflow-wrap:anywhere]",
                        (upiId ?? bank) !== null &&
                            "border-site-border border-t pt-4",
                    )}
                >
                    {instructions.note}
                </p>
            ) : null}
        </section>
    );
}

/** The QR, drawn as one SVG path; a picture to screen readers, by name. */
function UpiQr({ uri, label }: { uri: string; label: string }) {
    const { size, path } = qrPath(uri);
    return (
        <svg
            role="img"
            aria-label={label}
            viewBox={`0 0 ${size} ${size}`}
            shapeRendering="crispEdges"
            className="size-40 flex-none rounded-md"
            data-testid="upi-qr"
        >
            {/* Black on white whatever the site's theme: what a scanner reads. */}
            <rect width={size} height={size} fill="#ffffff" />
            <path d={path} fill="#000000" />
        </svg>
    );
}

function Fact({ label, value }: { label: string; value: string }) {
    return (
        <div className="border-site-border flex min-h-11 flex-wrap items-center gap-x-3 border-b py-1.5 last:border-b-0">
            <dt className="text-site-muted w-32 flex-none text-sm">{label}</dt>
            <dd className="text-site-fg min-w-0 flex-1 text-sm [overflow-wrap:anywhere]">
                {value}
            </dd>
        </div>
    );
}

type CopyState = "idle" | "copied" | "failed";

/**
 * A value to copy, with a Copy button big enough for a thumb. Says
 * "Copied" (to a screen reader too) and, where the browser refuses the
 * clipboard, to select it instead.
 */
function CopyRow({
    label,
    spoken = label,
    value,
    shown,
    mono,
    asFact,
}: {
    label: string;
    /** The value's name mid-sentence ("account number"); the label when absent. */
    spoken?: string;
    value: string;
    /** How it reads on the page, when not as copied ("1234 5678 9012"). */
    shown?: string;
    mono?: boolean;
    /** A row of a `<dl>`, rather than a line of its own. */
    asFact?: boolean;
}) {
    const [state, setState] = useState<CopyState>("idle");
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(
        () => () => {
            if (timer.current) clearTimeout(timer.current);
        },
        [],
    );

    async function copy() {
        try {
            await navigator.clipboard.writeText(value);
            setState("copied");
        } catch {
            setState("failed");
        }
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setState("idle"), 2500);
    }

    const text = (
        <span
            className={cn(
                "text-site-fg min-w-0 select-all text-sm [overflow-wrap:anywhere]",
                mono && "tabular-nums tracking-wide",
            )}
        >
            {shown ?? value}
        </span>
    );
    const button = (
        <button
            type="button"
            onClick={() => void copy()}
            aria-label={`Copy ${spoken}`}
            className={cn(
                "border-site-border text-site-fg ml-auto inline-flex h-11 min-w-[72px] flex-none cursor-pointer items-center justify-center rounded-lg border px-3 text-sm font-semibold",
                focusRing,
            )}
        >
            {state === "copied"
                ? "Copied"
                : state === "failed"
                  ? "Couldn't copy"
                  : "Copy"}
        </button>
    );
    const said = (
        <span role="status" aria-live="polite" className="sr-only">
            {state === "copied"
                ? `${label} copied`
                : state === "failed"
                  ? `Couldn't copy the ${spoken}. Select it and copy it instead.`
                  : ""}
        </span>
    );

    if (asFact) {
        return (
            <div className="border-site-border flex min-h-11 flex-wrap items-center gap-x-3 border-b py-1.5 last:border-b-0">
                <dt className="text-site-muted w-32 flex-none text-sm">
                    {label}
                </dt>
                <dd className="flex min-w-0 flex-1 items-center gap-3">
                    {text}
                    {button}
                    {said}
                </dd>
            </div>
        );
    }
    return (
        <div className="border-site-border mt-3 flex min-h-11 items-center gap-3 rounded-lg border py-1 pl-3 pr-1">
            <span className="sr-only">{label}: </span>
            {text}
            {button}
            {said}
        </div>
    );
}
