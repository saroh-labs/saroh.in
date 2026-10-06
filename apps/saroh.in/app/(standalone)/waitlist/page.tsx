import { Wordmark } from "@saroh/ui/wordmark";
import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";

import { Arrow } from "@/components/v2/arrow";
import { WaitlistForm } from "@/components/v2/waitlist/waitlist-form";
import { linkShown } from "@/content/resources";
import { SAROH_HANDLE, SAROH_SOCIAL } from "@/content/social";
import { galleryTemplates } from "@/content/templates";
import type { WaitlistContent } from "@/content/waitlist";
import {
    HERO_KINDS,
    launchOfferLines,
    WAITLIST,
    WAITLIST_FOOTER,
    WAITLIST_MONEY,
} from "@/content/waitlist";
import { readLaunchOffer } from "@/lib/launch-offer";
import { resourcesContext } from "@/lib/resources-context";
import { pageMetadata } from "@/lib/seo";
import { openingShort } from "@/lib/waitlist";

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
 * Static, refreshed every five minutes (ISR), the window the launch offer
 * is cached for, and at once when the API calls `/api/revalidate`.
 */
export const revalidate = 300;

/**
 * The waitlist (Waitlist design, plan U30): the site's one ask until
 * launch. It has its own header and footer, as the design draws them, so it
 * sits outside the `(v2)` chrome. The launch offer is the API's (U31); with
 * none, the form says it is announced at launch. The page reads no query, so
 * it stays static: the form reads `?plan=`, `?src=` (the CTA builder,
 * `lib/links.ts`), `?ref=` (a referral link) and `?template=` (a gallery
 * template's "Save … for early access") in the browser.
 */
export default async function WaitlistPage() {
    const offer = await readLaunchOffer();
    const content: WaitlistContent = {
        ...WAITLIST,
        offer: offer ? launchOfferLines(offer) : WAITLIST.offer,
    };
    const integrations = linkShown(
        WAITLIST_MONEY.link.href,
        resourcesContext(),
    );
    const opening = content.openingDate
        ? `Opens ${openingShort(content.openingDate)}`
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
                    <p className="m-0 max-w-[46ch] text-[14px] leading-[1.5] text-muted-foreground [text-wrap:pretty]">
                        {WAITLIST_MONEY.line}
                        {integrations ? (
                            <>
                                {" "}
                                <Link
                                    href={WAITLIST_MONEY.link.href}
                                    className="cursor-pointer whitespace-nowrap rounded-sm font-semibold text-brand-700 no-underline hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground focus-visible:[outline-style:solid]"
                                >
                                    {WAITLIST_MONEY.link.label}
                                    <Arrow />
                                </Link>
                            </>
                        ) : null}
                    </p>
                </div>

                <div className="flex flex-col gap-5 rounded-mk-card border border-border bg-white p-[clamp(20px,3vw,32px)] shadow-[0_4px_12px_rgba(28,28,26,0.10)]">
                    <WaitlistForm
                        content={content}
                        templates={galleryTemplates().map((t) => ({
                            slug: t.slug,
                            name: t.name,
                        }))}
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
                <nav
                    aria-label="Saroh elsewhere"
                    className="font-mono text-[12px]"
                >
                    {SAROH_HANDLE}
                    {SAROH_SOCIAL.map((link) => (
                        <span key={link.href}>
                            {" · "}
                            <a
                                href={link.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="cursor-pointer rounded-sm text-muted-foreground no-underline transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground focus-visible:[outline-style:solid]"
                            >
                                {link.label}
                            </a>
                        </span>
                    ))}
                </nav>
            </footer>
        </div>
    );
}
