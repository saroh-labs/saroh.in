import { Wordmark } from "@saroh/ui/wordmark";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "../cn";
import { NewTag } from "../links/pill";
import { ring } from "../ring";

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
                <div className="grid gap-x-12 gap-y-8 pb-10 pt-14 min-[760px]:grid-cols-[minmax(0,1.4fr)_minmax(0,3fr)] min-[760px]:pb-12">
                    <div className="grid content-start gap-4">
                        <Link
                            href="/"
                            prefetch={prefetch}
                            aria-label={homeLabel}
                            className={`w-fit rounded-sm text-foreground no-underline ${ring()}`}
                        >
                            <Wordmark aria-hidden style={{ fontSize: 24 }} />
                        </Link>
                        <p className="m-0 max-w-[36ch] text-[15px] leading-normal text-mk-copy">
                            {line}
                        </p>
                        {brand}
                    </div>
                    <div className="grid min-[760px]:grid-cols-[repeat(auto-fit,minmax(150px,1fr))] min-[760px]:gap-x-8 min-[760px]:gap-y-10">
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
                <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-border pb-8 pt-3 text-[14px] text-muted-foreground">
                    <span className="py-3">{note}</span>
                    {legal ? (
                        <div className="flex flex-wrap items-center gap-x-5 [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center [&_button]:min-h-11">
                            {legal}
                        </div>
                    ) : null}
                </div>
            </div>
        </footer>
    );
}
