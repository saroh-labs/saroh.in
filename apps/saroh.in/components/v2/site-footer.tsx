import { Wordmark } from "@saroh/ui/wordmark";
import Link from "next/link";
import type { ReactNode } from "react";

import { SAROH_CONTACT_EMAIL } from "@/content/contact";
import { CUSTOMERS } from "@/content/customers";
import { SAROH_NAME } from "@/content/name";
import { MADE_BY } from "@/content/resources";
import { SAROH_SOCIAL } from "@/content/social";
import { LAUNCH_MODE, SIGN_IN_URL } from "@/lib/links";

import { CookieChoicesButton } from "./cookie-choices-button";
import type { NavItem } from "./nav-items";
import { FEATURE_ITEMS, SOLUTION_ITEMS } from "./nav-items";

const LINK =
    "w-fit cursor-pointer rounded-sm text-muted-foreground no-underline transition-colors duration-fast ease-out hover:text-foreground focus-visible:[outline-style:solid] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500";

const SOCIAL_LINK =
    "grid size-9 cursor-pointer place-items-center rounded-md text-muted-foreground no-underline transition-colors duration-fast ease-out hover:bg-foreground/5 hover:text-foreground focus-visible:[outline-style:solid] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 [@media(pointer:coarse)]:size-11";

/**
 * The marks of Saroh's own accounts, by the label in `content/social.ts`.
 * Line drawings in `currentColor` (the outlines follow Tabler Icons, MIT),
 * so nothing is fetched from a network and none wears its brand colour.
 */
const SOCIAL_MARKS: Readonly<Record<string, readonly string[]>> = {
    Instagram: [
        "M4 8a4 4 0 0 1 4 -4h8a4 4 0 0 1 4 4v8a4 4 0 0 1 -4 4h-8a4 4 0 0 1 -4 -4z",
        "M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0",
        "M16.5 7.5v.01",
    ],
    X: [
        "M4 4l11.733 16h4.267l-11.733 -16z",
        "M4 20l6.768 -6.768m2.46 -2.46l6.772 -6.772",
    ],
    YouTube: [
        "M2 8a4 4 0 0 1 4 -4h12a4 4 0 0 1 4 4v8a4 4 0 0 1 -4 4h-12a4 4 0 0 1 -4 -4z",
        "M10 9l5 3l-5 3z",
    ],
    LinkedIn: [
        "M4 6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z",
        "M8 11v5",
        "M8 8v.01",
        "M12 16v-5",
        "M16 16v-3a2 2 0 0 0 -4 0",
    ],
    GitHub: [
        "M9 19c-4.3 1.4 -4.3 -2.5 -6 -3m12 5v-3.5c0 -1 .1 -1.4 -.5 -2c2.8 -.3 5.5 -1.4 5.5 -6a4.6 4.6 0 0 0 -1.3 -3.2a4.2 4.2 0 0 0 -.1 -3.2s-1.1 -.3 -3.5 1.3a12.3 12.3 0 0 0 -6.2 0c-2.4 -1.6 -3.5 -1.3 -3.5 -1.3a4.2 4.2 0 0 0 -.1 3.2a4.6 4.6 0 0 0 -1.3 3.2c0 4.6 2.7 5.7 5.5 6c-.6 .6 -.6 1.2 -.5 2v3.5",
    ],
};

/**
 * The footer: on the left Saroh, what the name means ("Let's rise
 * together", `content/name.ts`), who it is for and Saroh's own accounts as
 * a row of marks; on the right the link columns: Features, Solutions,
 * Resources (plan U1, when any is live), Tools (the free tools, when any is
 * live) and Saroh (Pricing once the launch switch is open, Questions,
 * Contact, Sign in once it is open too). The two sit side by side from
 * 1024px and stack below it; the columns wrap at 130px. Under them, who
 * makes Saroh and the legal pages that are published (R6): Privacy from its
 * date, and "Cookie choices" where the cookie notice can appear. No Terms
 * until they're published. Before them, always, "Bought from a business on
 * Saroh?" to /customers (DEC-121).
 *
 * `resources` and `legal` are the pages the server says are live and built
 * (`content/resources.ts`).
 */
export function SiteFooter({
    resources = [],
    tools = [],
    legal = [],
    cookieChoices = false,
}: {
    resources?: NavItem[];
    tools?: NavItem[];
    legal?: { name: string; href: string }[];
    /** Whether GA, and so the cookie notice, is on this deployment. */
    cookieChoices?: boolean;
}) {
    return (
        <footer className="px-mk-gutter pb-10 pt-[88px] text-[14px] text-muted-foreground">
            <div className="grid gap-x-16 gap-y-12 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
                <div className="grid content-start gap-5">
                    <Link
                        href="/"
                        aria-label="Saroh home"
                        className="w-fit rounded-sm text-foreground no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid]"
                    >
                        <Wordmark aria-hidden style={{ fontSize: 22 }} />
                    </Link>
                    <div className="grid gap-1.5">
                        <p className="m-0 text-[19px] font-semibold leading-snug tracking-[-0.01em] text-foreground">
                            {SAROH_NAME.line}
                        </p>
                        <p className="m-0 text-[13.5px] leading-normal">
                            <span lang="hi">{SAROH_NAME.word}</span>
                            {": "}
                            {SAROH_NAME.parts}
                        </p>
                    </div>
                    <p className="m-0 leading-normal">
                        For shops, studios and clinics in India.
                    </p>
                    <ul
                        aria-label="Follow Saroh"
                        className="m-0 -ml-2 flex list-none flex-wrap gap-1 p-0"
                    >
                        {SAROH_SOCIAL.map((link) => (
                            <li key={link.href}>
                                <a
                                    href={link.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={`Saroh on ${link.label}`}
                                    title={link.label}
                                    className={SOCIAL_LINK}
                                >
                                    <SocialMark label={link.label} />
                                </a>
                            </li>
                        ))}
                    </ul>
                </div>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,130px),1fr))] gap-x-8 gap-y-10">
                    <Column title="Features">
                        {FEATURE_ITEMS.map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={LINK}
                            >
                                {item.name}
                            </Link>
                        ))}
                    </Column>
                    <Column title="Solutions">
                        {SOLUTION_ITEMS.map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={LINK}
                            >
                                {item.name}
                            </Link>
                        ))}
                    </Column>
                    {resources.length > 0 ? (
                        <Column title="Resources">
                            {resources.map((item) => (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={LINK}
                                >
                                    {item.name}
                                </Link>
                            ))}
                        </Column>
                    ) : null}
                    {tools.length > 0 ? (
                        <Column title="Tools">
                            {tools.map((item) => (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={LINK}
                                >
                                    {item.name}
                                </Link>
                            ))}
                        </Column>
                    ) : null}
                    <Column title="Saroh">
                        {LAUNCH_MODE === "open" ? (
                            <Link href="/pricing" className={LINK}>
                                Pricing
                            </Link>
                        ) : null}
                        <Link href="/#faq" className={LINK}>
                            Questions
                        </Link>
                        <a
                            href={`mailto:${SAROH_CONTACT_EMAIL}`}
                            className={LINK}
                        >
                            Contact
                        </a>
                        {LAUNCH_MODE === "open" ? (
                            <a href={SIGN_IN_URL} className={LINK}>
                                Sign in
                            </a>
                        ) : null}
                    </Column>
                </div>
            </div>
            <div className="mt-14 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-border pt-6 text-[13.5px]">
                <span>{MADE_BY}</span>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                    {/* For a business's customers (DEC-121): always here,
                        since a paid merchant site links to Saroh nowhere. */}
                    <Link href={CUSTOMERS.href} className={LINK}>
                        {CUSTOMERS.footerLabel}
                    </Link>
                    <>
                        {legal.map((page) => (
                            <Link
                                key={page.href}
                                href={page.href}
                                className={LINK}
                            >
                                {page.name}
                            </Link>
                        ))}
                        {cookieChoices ? (
                            <CookieChoicesButton className={LINK} />
                        ) : null}
                    </>
                </div>
            </div>
        </footer>
    );
}

function SocialMark({ label }: { label: string }) {
    return (
        <svg
            aria-hidden
            viewBox="0 0 24 24"
            width={20}
            height={20}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            {(SOCIAL_MARKS[label] ?? []).map((d) => (
                <path key={d} d={d} />
            ))}
        </svg>
    );
}

function Column({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div className="grid content-start gap-2.5">
            <span className="mb-1 font-semibold text-foreground">{title}</span>
            {children}
        </div>
    );
}
