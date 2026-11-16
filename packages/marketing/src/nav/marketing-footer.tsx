import { Wordmark } from "@saroh/ui/wordmark";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "../cn";
import { NewTag } from "../links/pill";
import { textLinkClasses } from "../links/text-link";
import { ring } from "../ring";
import { SocialMark } from "./social-mark";

export interface FooterLink {
    name: string;
    href: string;
    isNew?: boolean;
}

export interface FooterGroup {
    title: string;
    links: readonly FooterLink[];
}

const LINK = `inline-flex min-h-11 w-fit items-center rounded-sm text-[15px] text-mk-copy no-underline transition-colors duration-fast ease-out hover:text-foreground ${ring()}`;

const isExternal = (href: string) => /^(https?:|mailto:|tel:)/.test(href);

/** A footer link: a page, or an address elsewhere. */
export function FooterAnchor({
    link,
    prefetch,
}: {
    link: FooterLink;
    prefetch?: boolean;
}) {
    return isExternal(link.href) ? (
        <a href={link.href} className={LINK}>
            {link.name}
        </a>
    ) : (
        <Link href={link.href} prefetch={prefetch} className={LINK}>
            {link.name}
            {link.isNew ? <NewTag /> : null}
        </Link>
    );
}

/**
 * The redesign's footer (KIT.md, the TS board), shared by every edition: the
 * wordmark and one line on the left, then `groups` in columns. The Product
 * group comes first, in the LOCKED order (Website builder, Orders,
 * Bookings, Billing, Share and posts, Saroh Social, Ask AI, AI apps, API and
 * webhooks), each site linking only what its switches show; whatever else a
 * site links folds into the groups after it. Under them, `note` (who makes
 * Saroh, ©) and `legal` (the site's legal row, its cookie button).
 *
 * On a phone each group is a closed `<details>`, so every link is in the
 * HTML a search engine reads, and from 760px they stand open (`.mk-fold`).
 * `brand` is what sits under the line: the name's meaning, Saroh's accounts.
 */
export function MarketingFooter({
    line,
    brand,
    groups,
    note,
    legal,
    homeLabel = "Saroh home",
    prefetch,
}: {
    line: ReactNode;
    brand?: ReactNode;
    groups: readonly FooterGroup[];
    note: ReactNode;
    legal?: ReactNode;
    homeLabel?: string;
    /** `false` on a static site that shouldn't fetch every linked page. */
    prefetch?: boolean;
}) {
    const shown = groups.filter((g) => g.links.length > 0);
    return (
        <footer className="border-t border-border">
            <div className="mx-auto max-w-mk-page px-mk-gutter">
                <div className="grid gap-x-12 gap-y-4 pb-3 pt-6 min-[760px]:grid-cols-[minmax(0,1.4fr)_minmax(0,3fr)] min-[760px]:gap-y-8 min-[760px]:pb-12 min-[760px]:pt-14">
                    {/* On a phone: the wordmark with the accounts beside it, then the line. */}
                    <div className="grid content-start items-center gap-3 max-[759px]:grid-cols-[auto_minmax(0,1fr)] max-[759px]:gap-x-0 min-[760px]:gap-4">
                        <Link
                            href="/"
                            prefetch={prefetch}
                            aria-label={homeLabel}
                            className={`w-fit rounded-sm text-foreground no-underline ${ring()}`}
                        >
                            <Wordmark aria-hidden style={{ fontSize: 24 }} />
                        </Link>
                        <p className="m-0 max-w-[36ch] text-[15px] leading-normal text-mk-copy max-[759px]:col-span-2">
                            {line}
                        </p>
                        {brand}
                    </div>
                    {/* Two folded groups a row on a phone; open, a group's links stay in its column. */}
                    <div className="grid grid-cols-2 items-start gap-x-5 min-[760px]:grid-cols-[repeat(auto-fit,minmax(150px,1fr))] min-[760px]:gap-x-8 min-[760px]:gap-y-10">
                        {shown.map((group) => (
                            <details
                                key={group.title}
                                className="mk-fold group border-b border-border min-[760px]:border-none"
                            >
                                <summary
                                    className={cn(
                                        "flex min-h-11 list-none items-center justify-between rounded-sm text-[14px] font-semibold text-foreground [&::-webkit-details-marker]:hidden",
                                        ring({ offset: "inset" }),
                                    )}
                                >
                                    {group.title}
                                    <ChevronDown
                                        aria-hidden
                                        className="size-4 transition-transform duration-fast group-open:rotate-180 min-[760px]:hidden"
                                    />
                                </summary>
                                <ul className="m-0 grid list-none p-0 pb-3 min-[760px]:pb-0 min-[760px]:pt-1">
                                    {group.links.map((link) => (
                                        <li key={link.href}>
                                            <FooterAnchor
                                                link={link}
                                                prefetch={prefetch}
                                            />
                                        </li>
                                    ))}
                                </ul>
                            </details>
                        ))}
                    </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-x-6 border-t border-border pb-4 pt-1 text-[13px] text-muted-foreground min-[760px]:gap-y-1 min-[760px]:pb-8 min-[760px]:pt-3 min-[760px]:text-[14px]">
                    <span className="py-2 min-[760px]:py-3">{note}</span>
                    {legal ? (
                        <div className="flex flex-wrap items-center gap-x-4 min-[760px]:gap-x-5 [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center [&_button]:min-h-11">
                            {legal}
                        </div>
                    ) : null}
                </div>
            </div>
        </footer>
    );
}

const SOCIAL_LINK = textLinkClasses({
    tone: "quiet",
    className:
        "grid size-9 place-items-center rounded-md hover:bg-foreground/5 [@media(pointer:coarse)]:size-11",
});

/**
 * What sits under the footer's line on every edition: what the name means
 * ("Let's rise together", सारोह: sa + aaroh) and Saroh's own accounts, each
 * a mark named for a screen reader. The words are the site's.
 */
export function FooterBrand({
    motto,
    word,
    parts,
    socials,
}: {
    motto: string;
    /** सारोह, set in Devanagari. */
    word: string;
    /** "sa (with) + aaroh (rising)". */
    parts: string;
    socials: readonly { label: string; href: string }[];
}) {
    return (
        <>
            {/* The name's meaning stands in the desk footer; on a phone it is in the HTML, not drawn. */}
            <div className="grid gap-1.5 max-[759px]:hidden">
                <p className="m-0 text-[19px] font-semibold leading-snug tracking-[-0.01em] text-foreground">
                    {motto}
                </p>
                <p className="m-0 text-[13.5px] leading-normal text-muted-foreground">
                    <span lang="hi">{word}</span>
                    {": "}
                    {parts}
                </p>
            </div>
            <ul
                aria-label="Follow Saroh"
                className="m-0 -ml-2 flex list-none flex-wrap gap-1 p-0 max-[759px]:col-start-2 max-[759px]:row-start-1 max-[759px]:-mr-2 max-[759px]:ml-0 max-[759px]:justify-end max-[759px]:gap-0"
            >
                {socials.map((link) => (
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
        </>
    );
}
