import { Wordmark } from "@saroh/ui/wordmark";
import Link from "next/link";
import type { ReactNode } from "react";

import { SAROH_SOCIAL } from "@/content/social";
import { SIGN_IN_URL } from "@/lib/links";

import { FEATURE_ITEMS, SOLUTION_ITEMS } from "./nav-items";

const LINK =
    "w-fit cursor-pointer rounded-sm text-muted-foreground no-underline transition-colors duration-fast ease-out hover:text-foreground focus-visible:[outline-style:solid] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500";

/**
 * The footer (Footer design): Saroh and who it is for, then Features,
 * Solutions and Saroh (Questions, Contact, Sign in), then Follow
 * (Saroh's accounts and its public code), in columns that wrap at 180px.
 */
export function SiteFooter() {
    return (
        <footer className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,180px),1fr))] gap-8 px-mk-gutter pb-12 pt-[88px] text-[14px] text-muted-foreground">
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
            <Column title="Follow">
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
