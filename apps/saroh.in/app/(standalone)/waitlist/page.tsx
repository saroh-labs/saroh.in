import { Wordmark } from "@saroh/ui/wordmark";
import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";

import { WaitlistForm } from "@/components/v2/waitlist/waitlist-form";
import { HERO_KINDS, WAITLIST, WAITLIST_FOOTER } from "@/content/waitlist";
import { pageMetadata } from "@/lib/seo";
import { openingShort, waitlistContext } from "@/lib/waitlist";

/*
 * The footer's one Devanagari word, सारोह, in Noto Sans Devanagari 500 (the
 * design's face). Subset to those five characters (about 1 KB), so the page
 * fetches no font for it from a network. SIL Open Font License 1.1,
 * Copyright 2022 The Noto Project Authors.
 */
const devanagari = localFont({
    src: "../../fonts/NotoSansDevanagari-saroh.woff2",
    weight: "500",
    style: "normal",
    display: "swap",
    variable: "--font-devanagari",
    preload: false,
});

const DESCRIPTION =
    "Join the Saroh waitlist: sell, take bookings and run your website from one place. We'll email you once, with your invite, when we open.";

export const metadata: Metadata = pageMetadata({
    title: "Join the waitlist — Saroh",
    description: DESCRIPTION,
    path: "/waitlist",
});

const GUTTER = "px-mk-gutter";
const FRAME = "mx-auto box-border w-full max-w-[1180px]";

/** "Services, Appointments, Retail, Orders. Handled." — the name's letters in Saffron. */
const HERO: [string, string][] = [
    ["S", "ervices, "],
    ["A", "ppointments, "],
    ["R", "etail, "],
    ["O", "rders. "],
    ["H", "andled."],
];

/**
 * The waitlist (Waitlist design, plan U30): the site's one ask until
 * launch. It has its own header and footer, as the design draws them, so it
 * sits outside the `(v2)` chrome. `?plan=` and `?src=` come from the CTA
 * builder (`lib/links.ts`), `?ref=` from a referral link.
 */
export default async function WaitlistPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const { plan, src, ref } = waitlistContext(await searchParams);
    const opening = WAITLIST.openingDate
        ? `Opens ${openingShort(WAITLIST.openingDate)}`
        : "Opening soon";

    return (
        <div
            className={`${devanagari.variable} flex min-h-screen flex-col bg-background font-sans text-foreground [line-height:normal]`}
        >
            <header
                className={`${FRAME} ${GUTTER} flex items-center justify-between py-5`}
            >
                <Link
                    href="/"
                    aria-label="Saroh home"
                    className="flex rounded-sm text-foreground no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground focus-visible:[outline-style:solid]"
                >
                    <Wordmark aria-hidden style={{ fontSize: 22 }} />
                </Link>
                <span className="font-mono text-[12px] text-muted-foreground">
                    {opening}
                </span>
            </header>

            <main
                id="main"
                className={`${FRAME} ${GUTTER} grid flex-1 grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] items-start gap-[clamp(28px,5vw,64px)] py-[clamp(24px,5vw,64px)]`}
            >
                <div className="flex flex-col gap-[22px] pt-2">
                    <h1 className="m-0 font-display text-[clamp(40px,6vw,68px)] font-semibold leading-[1.06] tracking-[-0.04em] [text-wrap:balance]">
                        {HERO.map(([initial, rest]) => (
                            <span key={initial}>
                                <span className="text-brand-500">
                                    {initial}
                                </span>
                                {rest}
                            </span>
                        ))}
                    </h1>
                    <p className="m-0 max-w-[46ch] text-[18px] leading-[1.55] text-neutral-600 [text-wrap:pretty]">
                        Sell, take bookings and run your website from one place.
                        Made in India, priced in rupees.
                    </p>
                    <div className="flex max-w-[460px] flex-col gap-2.5 border-t border-border pt-5">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                            For people who run
                        </span>
                        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                            {HERO_KINDS.map((kind) => (
                                <li
                                    key={kind.id}
                                    className="rounded-full border border-border bg-white px-[11px] py-[5px] text-[13px]"
                                >
                                    {kind.label}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                <div className="flex flex-col gap-5 rounded-mk-card border border-border bg-white p-[clamp(20px,3vw,32px)] shadow-[0_4px_12px_rgba(28,28,26,0.10)]">
                    <WaitlistForm
                        content={WAITLIST}
                        plan={plan}
                        src={src}
                        referral={ref}
                    />
                </div>
            </main>

            <footer
                className={`${FRAME} ${GUTTER} flex flex-wrap justify-between gap-2.5 border-t border-border py-5 text-[13px] text-muted-foreground`}
            >
                <span>
                    <span
                        lang="hi"
                        className="font-[family-name:var(--font-devanagari)]"
                    >
                        {WAITLIST_FOOTER.word}
                    </span>{" "}
                    · {WAITLIST_FOOTER.meaning}
                </span>
                <span className="font-mono text-[12px]">
                    {WAITLIST_FOOTER.social}
                </span>
            </footer>
        </div>
    );
}
