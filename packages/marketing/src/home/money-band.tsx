import { ArrowRight, CreditCard, Landmark, Smartphone } from "lucide-react";

import { Container } from "../layout/container";
import { TextLink } from "../links/text-link";
import type { HomeWords } from "./words";

/**
 * The money promise (`#money`, its one home on the landing): a ledger band,
 * the customer's money going straight to the business's own provider
 * account and on to its bank, and Saroh on a dashed line beside it, seeing
 * but never holding it. How it moves in full is /features' (`#money`).
 */
export function MoneyBand({
    words: M,
    chips,
    amount,
}: {
    words: HomeWords["money"];
    chips: readonly string[];
    /** The paid order's total, from the world: "₹1,450". */
    amount: string;
}) {
    const stops = [
        {
            icon: Smartphone,
            title: M.customer.title,
            line: M.customer.line.replace("{amount}", amount),
        },
        { icon: CreditCard, ...M.account },
        { icon: Landmark, ...M.bank },
    ];
    return (
        <section
            id="money"
            aria-labelledby="money-title"
            className="mt-12 scroll-mt-24 bg-mk-ledger pb-14 pt-12 text-mk-ledger-fg min-[760px]:mt-[72px] min-[760px]:pb-24 min-[760px]:pt-16"
        >
            <Container>
                <div className="grid gap-4 min-[960px]:grid-cols-[minmax(0,1fr)_460px] min-[960px]:items-start min-[960px]:gap-10">
                    <h2
                        id="money-title"
                        className="m-0 max-w-[22ch] font-display text-mk-kit-h2 font-bold [text-wrap:balance]"
                    >
                        {M.title}
                    </h2>
                    <div>
                        <p className="m-0 text-[16px] leading-normal text-mk-ledger-muted min-[760px]:text-mk-kit-lead">
                            {M.lede}
                        </p>
                        <ul className="m-0 mt-3 flex list-none flex-wrap gap-2 p-0">
                            {chips.map((c) => (
                                <li
                                    key={c}
                                    className="inline-flex h-8 items-center rounded-full border border-mk-ledger-muted/40 px-3 text-[13px] text-mk-ledger-fg"
                                >
                                    {c}
                                </li>
                            ))}
                        </ul>
                        <TextLink
                            href="/features#money"
                            tone="on-ink"
                            arrow
                            className="mt-2"
                        >
                            {M.link}
                        </TextLink>
                    </div>
                </div>
                <figure
                    aria-label={M.label}
                    className="m-0 mt-8 min-[760px]:mt-11"
                >
                    <ol className="m-0 grid list-none gap-2 p-0 min-[960px]:grid-cols-[minmax(0,1fr)_120px_minmax(0,1fr)_120px_minmax(0,1fr)] min-[960px]:gap-0">
                        {stops.map((s, i) => (
                            <li key={s.title} className="contents">
                                {i > 0 ? (
                                    <span
                                        aria-hidden
                                        className="relative hidden items-center min-[960px]:flex"
                                    >
                                        <span className="h-[2.5px] flex-1 bg-mk-ledger-fg" />
                                        <ArrowRight className="-ml-2 size-5 text-mk-ledger-fg" />
                                        {i === 1 ? (
                                            <span className="absolute left-1/2 top-1/2 flex size-[30px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-brand-500 text-[14px] font-bold text-foreground">
                                                {amount.charAt(0)}
                                            </span>
                                        ) : null}
                                    </span>
                                ) : null}
                                <div className="flex items-center gap-3 rounded-mk-card bg-card px-4 py-3 text-foreground shadow-[0_20px_40px_-20px_rgba(0,0,0,0.5)] min-[960px]:block min-[960px]:px-6 min-[960px]:py-[22px]">
                                    <span
                                        aria-hidden
                                        className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-mk-ok-tint text-mk-ok"
                                    >
                                        <s.icon className="size-[18px]" />
                                    </span>
                                    <span className="block min-[960px]:mt-3">
                                        <b className="block font-display text-[16px] font-bold tracking-[-0.02em] min-[960px]:text-[20px]">
                                            {s.title}
                                        </b>
                                        <span className="mt-1 block text-[14px] leading-snug text-mk-copy">
                                            {s.line}
                                        </span>
                                    </span>
                                </div>
                            </li>
                        ))}
                    </ol>
                    <div className="mt-3 grid min-[960px]:mt-0 min-[960px]:justify-items-center">
                        <span
                            aria-hidden
                            className="hidden h-10 items-center gap-3 border-l-2 border-dashed border-mk-ledger-muted/70 pl-3 text-[14px] text-mk-ledger-muted min-[960px]:flex"
                        >
                            {M.wire}
                        </span>
                        <p className="m-0 max-w-[420px] rounded-mk-card border-[1.5px] border-dashed border-mk-ledger-muted/70 px-4 py-3 text-[14px] leading-normal text-mk-ledger-muted min-[960px]:px-[22px] min-[960px]:py-[18px]">
                            <b className="block font-display text-[18px] font-bold text-mk-ledger-fg">
                                {M.saroh.title}
                            </b>
                            {M.saroh.line}
                        </p>
                    </div>
                </figure>
            </Container>
        </section>
    );
}
