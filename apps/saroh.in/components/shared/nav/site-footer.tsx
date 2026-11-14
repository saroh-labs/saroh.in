import { Wordmark } from "@saroh/ui/wordmark";
import Link from "next/link";
import type { ReactNode } from "react";

import { ABOUT } from "@/content/about";
import { CONTACT_PAGE } from "@/content/contact-page";
import { CUSTOMERS } from "@/content/customers";
import { SAROH_NAME } from "@/content/name";
import { MADE_BY } from "@/content/resources";
import { SAROH_SOCIAL } from "@/content/social";
import { LAUNCH_MODE, SIGN_IN_URL } from "@/lib/links";
import { ring } from "@saroh/marketing/ring";

import { NewTag } from "@saroh/marketing/pill";
import { SocialMark } from "@saroh/marketing/social-mark";
import { textLinkClasses } from "@saroh/marketing/text-link";
import { CookieChoicesButton } from "./cookie-choices-button";
import type { NavItem } from "./nav-items";
import { FEATURE_ITEMS, SOLUTION_ITEMS } from "./nav-items";

const LINK = textLinkClasses({ tone: "quiet", className: "w-fit" });

const SOCIAL_LINK = textLinkClasses({
    tone: "quiet",
    className:
        "grid size-9 place-items-center rounded-md hover:bg-foreground/5 [@media(pointer:coarse)]:size-11",
});

/**
 * The footer: on the left Saroh, what the name means ("Let's rise
 * together", `content/name.ts`), who it is for and Saroh's own accounts as
 * a row of marks; on the right the link columns: Features, Solutions,
 * Resources (plan U1, when any is live), Tools (the free tools, when any is
 * live) and Saroh (Pricing once the launch switch is open, About,
 * Questions, Contact, Sign in once it is open too). The two sit side by side from
 * 1024px and stack below it; the columns wrap at 130px. Under them, who
 * makes Saroh with the copyright line (the year the site was built) and the legal pages that are published (R6): Privacy from its
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
    solutions = SOLUTION_ITEMS,
}: {
    /** The Solutions column, as the server links it (`solutionLink`). */
    solutions?: NavItem[];
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
                        className={`w-fit rounded-sm text-foreground no-underline ${ring()}`}
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
                                {item.isNew ? <NewTag /> : null}
                            </Link>
                        ))}
                    </Column>
                    <Column title="Solutions">
                        {solutions.map((item) => (
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
                                    {item.isNew ? <NewTag /> : null}
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
                        <Link href={ABOUT.href} className={LINK}>
                            {ABOUT.name}
                        </Link>
                        <Link href="/#faq" className={LINK}>
                            Questions
                        </Link>
                        {/* The Contact page gives contact@saroh.in
                            (DEC-101) and a form (DEC-137). */}
                        <Link href={CONTACT_PAGE.href} className={LINK}>
                            {CONTACT_PAGE.name}
                        </Link>
                        {LAUNCH_MODE === "open" ? (
                            <a href={SIGN_IN_URL} className={LINK}>
                                Sign in
                            </a>
                        ) : null}
                    </Column>
                </div>
            </div>
            <div className="mt-14 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-border pt-6 text-[13.5px]">
                <span>
                    {MADE_BY}. © {new Date().getFullYear()}. All rights
                    reserved.
                </span>
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

function Column({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div className="grid content-start gap-2.5">
            <span className="mb-1 font-semibold text-foreground">{title}</span>
            {children}
        </div>
    );
}
