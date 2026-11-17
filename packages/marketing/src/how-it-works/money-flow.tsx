import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

import { TimeStamp } from "../kit/time-stamp";

import { Rich } from "./rich";

/**
 * How money moves, on the ledger band (board HWDesk, "Your money."): the
 * customer pays, it lands in the business's own provider account (the
 * paper box, the only light one), then its bank; Saroh sits below on a
 * dashed line, hearing about it and holding nothing. On a phone the three
 * stack with a Saffron wire between them. Every word is the page's, from its
 * world, so saroh.tech draws Stripe and its own currency here.
 */
export function MoneyFlow({
    label,
    at,
    from,
    via,
    to,
    saroh,
}: {
    label: string;
    /** "HH:MM", when the customer pays. */
    at: string;
    from: { title: string; line: string };
    via: { label: string; title: string; line: string };
    to: { label: string; title: string; line: string };
    saroh: { name: string; line: string; holds: ReactNode };
}) {
    const box =
        "grid gap-1.5 rounded-mk-card border border-mk-ledger-muted/40 px-5 py-5";
    const wire = (
        <span
            aria-hidden
            className="mx-auto h-6 w-0.5 bg-brand-500 min-[760px]:hidden"
        />
    );
    const arrow = (
        <ArrowRight
            aria-hidden
            className="hidden size-5 self-center justify-self-center text-brand-500 min-[760px]:block"
        />
    );
    return (
        <figure aria-label={label} className="m-0 grid gap-4">
            <div className="grid min-[760px]:grid-cols-[1fr_40px_1fr_40px_1fr]">
                <div className={box}>
                    <TimeStamp
                        at={at}
                        className="text-[13px] text-mk-ledger-muted"
                    />
                    <b className="text-[20px] font-semibold">{from.title}</b>
                    <span className="text-[14px] text-mk-ledger-fg/85">
                        {from.line}
                    </span>
                </div>
                {wire}
                {arrow}
                <div className="grid gap-1.5 rounded-mk-card bg-background px-5 py-5 text-foreground">
                    <span className="text-[13px] text-muted-foreground">
                        {via.label}
                    </span>
                    <b className="text-[20px] font-semibold">{via.title}</b>
                    <span className="text-[14px] text-mk-copy">{via.line}</span>
                </div>
                {wire}
                {arrow}
                <div className={box}>
                    <span className="text-[13px] text-mk-ledger-muted">
                        {to.label}
                    </span>
                    <b className="text-[20px] font-semibold">{to.title}</b>
                    <span className="text-[14px] text-mk-ledger-fg/85">
                        {to.line}
                    </span>
                </div>
            </div>
            <div className="grid gap-3 rounded-mk-card border border-dashed border-mk-ledger-muted/50 px-5 py-4 min-[760px]:ml-[calc((100%-80px)/3+40px)] min-[760px]:grid-cols-[auto_1fr_auto] min-[760px]:items-center min-[760px]:gap-5">
                <b className="text-[15px] font-semibold">{saroh.name}</b>
                <p className="m-0 text-[14px] leading-snug text-mk-ledger-fg/90 [&_b]:font-mono [&_b]:text-mk-ledger-fg">
                    <Rich text={saroh.line} />
                </p>
                <span className="w-fit rounded-full bg-mk-ledger-fg/15 px-3 py-1.5 text-[14px] font-semibold">
                    {saroh.holds}
                </span>
            </div>
        </figure>
    );
}
