import {
    FooterBrand,
    MarketingFooter,
} from "@saroh/marketing/marketing-footer";
import { textLinkClasses } from "@saroh/marketing/text-link";
import Link from "next/link";

import { SAROH_SOCIAL } from "@/content/social";
import { FOOTER_COLUMNS, LEGAL_LINKS } from "@/lib/nav";
import { signInHref, site } from "@/site.config";

const LINK = textLinkClasses({ tone: "quiet", className: "w-fit" });

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
                <FooterBrand
                    motto="Let's rise together."
                    word="सारोह"
                    parts="sa (with) + aaroh (rising)"
                    socials={SAROH_SOCIAL}
                />
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
