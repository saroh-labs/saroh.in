import type { Metadata } from "next";

import { Pill } from "@/components/site/bits";
import { ClosingCta } from "@/components/site/closing-cta";
import { LIMITS } from "@/lib/site-content";

export const metadata: Metadata = {
    title: "What Saroh will not do — Saroh",
    description:
        "Everything Saroh has decided not to build, or has not built yet — so you find out here, not three weeks after moving your business across.",
};

export default function Limits() {
    const notBuilt = LIMITS.filter((l) => l.tag === "Not built").length;

    return (
        <>
            <section className="mx-auto max-w-[900px] px-4 pb-[34px] pt-[52px] sm:px-10">
                <div className="mb-4 font-mono text-[11px] text-muted-foreground">
                    /what-it-will-not-do
                </div>
                <h1 className="mb-4 font-display text-[30px] font-semibold leading-[1.04] tracking-[-0.04em] min-[421px]:text-[38px] md:text-[48px]">
                    What Saroh will not do
                </h1>
                <p className="mb-3 max-w-[60ch] text-pretty text-[18px] leading-[1.6] text-neutral-600 dark:text-neutral-400">
                    Every one of these is something we decided not to build, or
                    have not built yet. None of it is coming next week, and we
                    would rather you found out on this page than three weeks
                    after moving your business across.
                </p>
                <p className="mb-[30px] max-w-[60ch] text-pretty text-[16px] leading-[1.6] text-muted-foreground">
                    {LIMITS.length} of them: {notBuilt} we have not built,{" "}
                    {LIMITS.length - notBuilt} that are limits of how Saroh
                    works today.
                </p>
                <ul className="flex flex-col gap-[13px]">
                    {LIMITS.map((limit) => (
                        <li
                            key={limit.title}
                            className="flex flex-wrap items-start gap-3 rounded-[14px] border border-border bg-card px-[22px] py-5"
                        >
                            <div className="min-w-0 flex-[1_1_260px]">
                                <h2 className="mb-[7px] text-pretty font-display text-[18px] font-semibold tracking-[-0.02em]">
                                    {limit.title}
                                </h2>
                                <p className="text-pretty text-[16px] leading-[1.6] text-neutral-600 dark:text-neutral-400">
                                    {limit.body}
                                </p>
                                <p className="mt-[9px] text-pretty text-[13px] leading-[1.6] text-muted-foreground">
                                    <strong className="font-semibold text-neutral-600 dark:text-neutral-300">
                                        If this is your deal-breaker:
                                    </strong>{" "}
                                    {limit.instead}
                                </p>
                            </div>
                            <Pill tone="off">{limit.tag}</Pill>
                        </li>
                    ))}
                </ul>
            </section>

            <section className="mx-auto max-w-[900px] px-4 pb-[54px] pt-[52px] sm:px-10">
                <div className="rounded-[16px] bg-brand-surface px-5 py-7 text-brand-surface-foreground sm:px-[30px]">
                    <h2 className="mb-[11px] font-display text-[22px] font-semibold leading-[1.14] tracking-[-0.03em]">
                        The one rule we will not trade
                    </h2>
                    <p className="mb-[18px] text-pretty text-[16px] leading-[1.6] text-neutral-200">
                        A figure Saroh cannot read is withheld and named, never
                        shown as nought. A silence and a zero are different
                        numbers, and planning a week on the wrong one costs real
                        money.
                    </p>
                    <figure className="overflow-hidden rounded-[12px] border border-neutral-600">
                        <div className="flex items-start gap-2.5 bg-neutral-800 px-[15px] py-[13px]">
                            <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                aria-hidden
                                className="mt-px size-[17px] shrink-0 text-brand-300"
                            >
                                <path
                                    d="M12 3.5 L21.5 20 H2.5 Z M12 10 V14.5 M12 17.4 H12.1"
                                    stroke="currentColor"
                                    strokeWidth="1.9"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </svg>
                            <p className="text-pretty text-[12px] leading-normal text-brand-200">
                                Open orders could not be loaded, so this is not
                                the whole picture.
                            </p>
                        </div>
                        <div className="flex flex-wrap">
                            <div className="min-w-[130px] flex-[1_1_140px] border-t border-neutral-600 px-4 py-3.5">
                                <div className="min-h-[26px] text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-200">
                                    Open orders
                                </div>
                                <div className="mt-[5px] font-display text-[22px] font-semibold tracking-[-0.03em] text-neutral-200">
                                    —
                                </div>
                                <div className="mt-[3px] text-[11px] text-neutral-200">
                                    Withheld, not zero
                                </div>
                            </div>
                            <div className="min-w-[130px] flex-[1_1_140px] border-t border-neutral-600 px-4 py-3.5">
                                <div className="min-h-[26px] text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-200">
                                    Bookings coming up
                                </div>
                                <div className="mt-[5px] font-display text-[22px] font-semibold tabular-nums tracking-[-0.03em]">
                                    3
                                </div>
                                <div className="mt-[3px] text-[11px] text-neutral-200">
                                    Read, correct
                                </div>
                            </div>
                        </div>
                        <figcaption className="sr-only">
                            An example of a figure withheld, in the words Home
                            uses: Open orders shows a dash because it could not
                            be read; Bookings coming up shows 3 because it
                            could.
                        </figcaption>
                    </figure>
                </div>
            </section>

            <ClosingCta />
        </>
    );
}
