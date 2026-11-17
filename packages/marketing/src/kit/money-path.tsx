import type { ReactNode } from "react";

import { cn } from "../cn";

/** One stop the money makes. */
export interface MoneyStop {
    /** Whose it is: "Anjali's phone", "Her own Razorpay account". */
    label: string;
    /** What's there: "₹1,450", "Rye & Co.". */
    title: ReactNode;
    line: ReactNode;
}

const NODE =
    "rounded-[18px] p-5 shadow-[0_18px_40px_-18px_rgba(70,45,15,0.3),0_2px_8px_rgba(70,45,15,0.06)]";

function Stop({ stop, ledger = false }: { stop: MoneyStop; ledger?: boolean }) {
    return (
        <div
            className={cn(
                NODE,
                ledger
                    ? "bg-mk-ledger text-mk-ledger-fg"
                    : "bg-card text-foreground",
            )}
        >
            <p
                className={cn(
                    "m-0 text-[14px]",
                    ledger ? "text-mk-ledger-muted" : "text-muted-foreground",
                )}
            >
                {stop.label}
            </p>
            <p className="m-0 mt-2.5 font-display text-[30px] font-bold leading-none tracking-[-0.03em]">
                {stop.title}
            </p>
            <p
                className={cn(
                    "m-0 mt-2 text-[14px] leading-snug",
                    ledger ? "text-mk-ledger-fg/90" : "text-mk-copy",
                )}
            >
                {stop.line}
            </p>
        </div>
    );
}

function Wire({ label, moving = false }: { label: string; moving?: boolean }) {
    return (
        <div
            aria-hidden
            className="relative flex items-center justify-center max-[759px]:h-16 min-[760px]:h-full"
        >
            <span className="absolute rounded-sm bg-foreground max-[759px]:inset-y-0 max-[759px]:left-8 max-[759px]:w-1 min-[760px]:inset-x-2 min-[760px]:top-1/2 min-[760px]:h-1 min-[760px]:-translate-y-1/2" />
            {moving ? (
                <span className="absolute size-4 rounded-full bg-brand-500 shadow-[0_0_0_5px_hsl(var(--brand-500)/0.22)] max-[759px]:left-[26px] min-[760px]:top-1/2 min-[760px]:-translate-y-1/2" />
            ) : null}
            <span className="relative font-mono text-[13px] font-medium text-mk-copy max-[759px]:ml-24 min-[760px]:-translate-y-6">
                {label}
            </span>
        </div>
    );
}

/**
 * How money moves (the 4 pm scene, /features' "how money moves"): from the
 * customer, into the business's own provider account (ledger green, the only
 * place it appears), on to its bank; and Saroh beside it, on a dashed line,
 * watching but never holding it. `wires` name the two hops ("UPI",
 * "Settled"); `status` sits beside Saroh ("Paid · 4:06 pm"). Every word and
 * name (Razorpay or Stripe, ₹ or $) is the page's, from its world.
 */
export function MoneyPath({
    label,
    from,
    via,
    to,
    wires,
    saroh,
    status,
    className,
}: {
    /** Names the drawing for a screen reader. */
    label: string;
    from: MoneyStop;
    via: MoneyStop;
    to: MoneyStop;
    wires: readonly [string, string];
    saroh: { title: ReactNode; line: ReactNode };
    status?: ReactNode;
    className?: string;
}) {
    return (
        <figure aria-label={label} className={cn("m-0", className)}>
            <ol className="m-0 grid list-none p-0 min-[760px]:grid-cols-[minmax(0,1fr)_96px_minmax(0,1fr)_96px_minmax(0,1fr)]">
                <li>
                    <Stop stop={from} />
                </li>
                <li aria-hidden className="contents">
                    <Wire label={wires[0]} moving />
                </li>
                <li>
                    <Stop stop={via} ledger />
                </li>
                <li aria-hidden className="contents">
                    <Wire label={wires[1]} />
                </li>
                <li>
                    <Stop stop={to} />
                </li>
            </ol>
            <div className="grid min-[760px]:grid-cols-[minmax(0,1fr)_96px_minmax(0,1fr)_96px_minmax(0,1fr)]">
                {/* The dashed line from her account down to Saroh: it sees, never holds. */}
                <span
                    aria-hidden
                    className="ml-8 h-12 w-0 border-l-2 border-dashed border-border-strong min-[760px]:col-start-3 min-[760px]:mx-auto min-[760px]:h-20"
                />
                <div className="grid gap-4 min-[760px]:col-span-5 min-[760px]:grid-cols-subgrid">
                    <div className="rounded-[18px] bg-foreground px-[22px] py-5 text-background min-[760px]:col-span-3 min-[760px]:col-start-2">
                        <p className="m-0 flex items-center gap-1.5 font-display text-[20px] font-bold tracking-[-0.02em]">
                            {saroh.title}
                            <span
                                aria-hidden
                                className="size-1.5 rounded-full bg-brand-500"
                            />
                        </p>
                        <p className="m-0 mt-2 text-[15px] leading-normal text-mk-on-ink">
                            {saroh.line}
                        </p>
                    </div>
                    {status ? (
                        <div className="self-center text-[14px] text-mk-copy">
                            {status}
                        </div>
                    ) : null}
                </div>
            </div>
        </figure>
    );
}
