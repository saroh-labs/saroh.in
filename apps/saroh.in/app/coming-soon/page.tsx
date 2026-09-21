import type { Metadata } from "next";

import { Pill } from "@/components/site/bits";
import { ClosingCta } from "@/components/site/closing-cta";
import { COMING } from "@/lib/site-content";

export const metadata: Metadata = {
    title: "Coming soon — Saroh",
    description:
        "What Saroh is building next — online payments, reminders, one catalogue for every storefront and more — and how to manage until each arrives.",
};

export default function ComingSoon() {
    return (
        <>
            <section className="mx-auto max-w-[900px] px-4 pb-[34px] pt-[52px] sm:px-10">
                <div className="mb-4 font-mono text-[11px] text-muted-foreground">
                    /coming-soon
                </div>
                <h1 className="mb-4 font-display text-[30px] font-semibold leading-[1.04] tracking-[-0.04em] min-[421px]:text-[38px] md:text-[48px]">
                    Coming soon
                </h1>
                <p className="mb-3 max-w-[60ch] text-pretty text-[18px] leading-[1.6] text-highlight-600 dark:text-highlight-400">
                    What we are building next. Each one is here because it saves
                    a small business real time or real money — and each one says
                    how to manage until it arrives, so nothing on this page is a
                    surprise after you have moved your business across.
                </p>
                <p className="mb-[30px] max-w-[60ch] text-pretty text-[16px] leading-[1.6] text-muted-foreground">
                    No dates: we would rather tell you when something ships than
                    promise when it will.
                </p>
                <ul className="flex flex-col gap-[13px]">
                    {COMING.map((item) => (
                        <li
                            key={item.title}
                            className="flex flex-wrap items-start gap-3 rounded-[14px] border border-border bg-card px-[22px] py-5"
                        >
                            <div className="min-w-0 flex-[1_1_260px]">
                                <h2 className="mb-[7px] text-pretty font-display text-[18px] font-semibold tracking-[-0.02em]">
                                    {item.title}
                                </h2>
                                <p className="text-pretty text-[16px] leading-[1.6] text-highlight-600 dark:text-highlight-400">
                                    {item.body}
                                </p>
                                {item.meanwhile ? (
                                    <p className="mt-[9px] text-pretty text-[13px] leading-[1.6] text-muted-foreground">
                                        <strong className="font-semibold text-highlight-600 dark:text-highlight-300">
                                            Until then:
                                        </strong>{" "}
                                        {item.meanwhile}
                                    </p>
                                ) : null}
                            </div>
                            <Pill tone="warn">Coming soon</Pill>
                        </li>
                    ))}
                </ul>
            </section>

            <section className="mx-auto max-w-[900px] px-4 pb-[54px] pt-[52px] sm:px-10">
                <div className="rounded-[16px] bg-brand-surface px-5 py-7 text-brand-surface-foreground sm:px-[30px]">
                    <h2 className="mb-[11px] font-display text-[22px] font-semibold leading-[1.14] tracking-[-0.03em]">
                        What will not change as we build
                    </h2>
                    <p className="mb-[18px] text-pretty text-[16px] leading-[1.6] text-highlight-200">
                        A figure Saroh cannot read is withheld and named, never
                        shown as nought. A silence and a zero are different
                        numbers, and planning a week on the wrong one costs real
                        money.
                    </p>
                    <figure className="overflow-hidden rounded-[12px] border border-highlight-600">
                        <div className="flex items-start gap-2.5 bg-highlight-800 px-[15px] py-[13px]">
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
                            <div className="min-w-[130px] flex-[1_1_140px] border-t border-highlight-600 px-4 py-3.5">
                                <div className="min-h-[26px] text-[11px] font-semibold uppercase tracking-[0.1em] text-highlight-200">
                                    Open orders
                                </div>
                                <div className="mt-[5px] font-display text-[22px] font-semibold tracking-[-0.03em] text-highlight-200">
                                    —
                                </div>
                                <div className="mt-[3px] text-[11px] text-highlight-200">
                                    Withheld, not zero
                                </div>
                            </div>
                            <div className="min-w-[130px] flex-[1_1_140px] border-t border-highlight-600 px-4 py-3.5">
                                <div className="min-h-[26px] text-[11px] font-semibold uppercase tracking-[0.1em] text-highlight-200">
                                    Bookings coming up
                                </div>
                                <div className="mt-[5px] font-display text-[22px] font-semibold tabular-nums tracking-[-0.03em]">
                                    3
                                </div>
                                <div className="mt-[3px] text-[11px] text-highlight-200">
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
