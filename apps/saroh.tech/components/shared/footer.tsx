import { MarketingFooter } from "@saroh/marketing/marketing-footer";
import { SocialMark } from "@saroh/marketing/social-mark";
import { textLinkClasses } from "@saroh/marketing/text-link";
import Link from "next/link";

import { SAROH_SOCIAL } from "@/content/social";
import { FOOTER_COLUMNS, LEGAL_LINKS } from "@/lib/nav";
import { signInHref, site } from "@/site.config";

const LINK = textLinkClasses({ tone: "quiet", className: "w-fit" });

const SOCIAL_LINK = textLinkClasses({
    tone: "quiet",
    className:
        "grid size-9 place-items-center rounded-md hover:bg-foreground/5 [@media(pointer:coarse)]:size-11",
});

/**
 * saroh.tech's footer, on the redesign's shared `MarketingFooter` (DEC-221):
 * the wordmark, one line, what the name means and Saroh's accounts; then
 * `FOOTER_COLUMNS` (Product first, in the LOCKED order), Sign in in the Saroh
 * group; the company, the region and the way to saroh.in, and the legal row.
 */
export function Footer() {
    const groups = FOOTER_COLUMNS.map((c) =>
        c.title === "Saroh"
            ? {
                  ...c,
                  links: [...c.links, { name: "Sign in", href: signInHref }],
              }
            : c,
    );
    return (
        <MarketingFooter
            line="Your site, orders, bookings and billing, for small businesses."
            brand={
                <>
                    <div className="grid gap-1.5">
                        <p className="m-0 text-[19px] font-semibold leading-snug tracking-[-0.01em] text-foreground">
                            Let's rise together.
                        </p>
                        <p className="m-0 text-[13.5px] leading-normal text-muted-foreground">
                            <span lang="hi">सारोह</span>: sa (with) + aaroh
                            (rising)
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
                </>
            }
            groups={groups}
            prefetch={false}
            note={
                <>
                    A product of {site.company}. © {new Date().getFullYear()}.
                    All rights reserved. Region: Global.{" "}
                    <a data-region-link href={site.india} className={LINK}>
                        In India? Go to saroh.in
                    </a>
                </>
            }
            legal={LEGAL_LINKS.map((link) => (
                <Link
                    prefetch={false}
                    key={link.href}
                    href={link.href}
                    className={LINK}
                >
                    {link.name}
                </Link>
            ))}
        />
    );
}
