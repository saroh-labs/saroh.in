import { Wordmark } from "@saroh/ui/wordmark";
import Link from "next/link";
import type { ReactNode } from "react";

import { MADE_BY } from "@/content/resources";
import { SAROH_SOCIAL } from "@/content/social";
import { SIGN_IN_URL } from "@/lib/links";

import { CookieChoicesButton } from "./cookie-choices-button";
import type { NavItem } from "./nav-items";
import { FEATURE_ITEMS, SOLUTION_ITEMS } from "./nav-items";

const LINK =
    "w-fit cursor-pointer rounded-sm text-muted-foreground no-underline transition-colors duration-fast ease-out hover:text-foreground focus-visible:[outline-style:solid] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500";

/**
 * The footer (Footer design): Saroh and who it is for, then Features,
 * Solutions, Resources (plan U1, when any is live), Saroh (Questions,
 * Contact, Sign in) and Follow Saroh (Saroh's accounts and its public
 * code), in columns that wrap at 150px (180px before Resources made six). Under them, who makes Saroh and the
 * legal pages that are published (R6): Privacy from its date, and "Cookie
 * choices" where the cookie notice can appear. No Terms until they're
 * published.
 *
 * `resources` and `legal` are the pages the server says are live and built
 * (`content/resources.ts`).
 */
export function SiteFooter({
    resources = [],
    legal = [],
    cookieChoices = false,
}: {
    resources?: NavItem[];
    legal?: { name: string; href: string }[];
    /** Whether GA, and so the cookie notice, is on this deployment. */
    cookieChoices?: boolean;
}) {
    return (
        <footer className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,150px),1fr))] gap-8 px-mk-gutter pb-12 pt-[88px] text-[14px] text-muted-foreground">
            <div className="grid content-start gap-2.5">
                <Link
                    href="/"
                    aria-label="Saroh home"
                    className="w-fit rounded-sm text-foreground no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid]"
                >
                    <Wordmark aria-hidden style={{ fontSize: 16 }} />
                </Link>
                <span className="leading-normal">
                    For shops, studios and clinics in India.
                </span>
            </div>
            <Column title="Features">
                {FEATURE_ITEMS.map((item) => (
                    <Link key={item.href} href={item.href} className={LINK}>
                        {item.name}
                    </Link>
                ))}
            </Column>
            <Column title="Solutions">
                {SOLUTION_ITEMS.map((item) => (
                    <Link key={item.href} href={item.href} className={LINK}>
                        {item.name}
                    </Link>
                ))}
            </Column>
            {resources.length > 0 ? (
                <Column title="Resources">
                    {resources.map((item) => (
                        <Link key={item.href} href={item.href} className={LINK}>
                            {item.name}
                        </Link>
                    ))}
                </Column>
            ) : null}
            <Column title="Saroh">
                <Link href="/#faq" className={LINK}>
                    Questions
                </Link>
                <a href="mailto:hello@saroh.in" className={LINK}>
                    Contact
                </a>
                <a href={SIGN_IN_URL} className={LINK}>
                    Sign in
                </a>
            </Column>
            <Column title="Follow Saroh">
                {SAROH_SOCIAL.map((link) => (
                    <a
                        key={link.href}
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={LINK}
                    >
                        {link.label}
                    </a>
                ))}
            </Column>
            <div className="col-[1/-1] flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-border pt-6 text-[13.5px]">
                <span>{MADE_BY}</span>
                {legal.length > 0 || cookieChoices ? (
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
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
                    </div>
                ) : null}
            </div>
        </footer>
    );
}

function Column({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div className="grid content-start gap-2">
            <span className="font-semibold text-foreground">{title}</span>
            {children}
        </div>
    );
}
