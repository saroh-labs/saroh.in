import type {
    FooterGroup,
    FooterLink,
} from "@saroh/marketing/marketing-footer";
import {
    FooterBrand,
    MarketingFooter,
} from "@saroh/marketing/marketing-footer";
import { ring } from "@saroh/marketing/ring";
import { textLinkClasses } from "@saroh/marketing/text-link";
import Link from "next/link";

import { ABOUT } from "@/content/about";
import { CONTACT_PAGE } from "@/content/contact-page";
import { CUSTOMERS } from "@/content/customers";
import { featureHref, featureList } from "@/content/features";
import { SAROH_NAME } from "@/content/name";
import { FOOTER_WORDS, NAV_WORDS, PRODUCT_GROUP } from "@/content/nav";
import { MADE_BY } from "@/content/resources";
import { SAROH_SOCIAL } from "@/content/social";
import { claimOn } from "@/lib/feature-switches";
import { LAUNCH_MODE, SIGN_IN_URL } from "@/lib/links";

import { CookieChoicesButton } from "./cookie-choices-button";
import type { NavItem } from "./nav-items";
import { SOLUTION_ITEMS } from "./nav-items";

const LINK = textLinkClasses({ tone: "quiet", className: "w-fit" });

const shown = new Set<string>(featureList.map((f) => f.slug));

/**
 * The Product group, in the LOCKED order (WORLD.md): each link only when
 * its page is shown, Saroh Social only while its claim is on (DEC-221).
 */
function productGroup(developers: NavItem | undefined): FooterLink[] {
    return PRODUCT_GROUP.flatMap((p): FooterLink[] => {
        if ("page" in p) {
            return developers ? [{ name: p.name, href: developers.href }] : [];
        }
        if (!shown.has(p.feature)) return [];
        if ("claim" in p && !claimOn(p.claim)) return [];
        const hash = "hash" in p ? `#${p.hash}` : "";
        return [{ name: p.name, href: `${featureHref(p.feature)}${hash}` }];
    });
}

/**
 * The footer, on the redesign's shared `MarketingFooter` (DEC-221): the
 * wordmark, one line, what the name means ("Let's rise together",
 * `content/name.ts`) and Saroh's own accounts; then the groups: Product (in
 * the LOCKED order), Also in Saroh (the features Product doesn't name), For
 * your trade, Resources (plan U1, when any is live), Tools (the free tools,
 * when any is live) and Saroh (Pricing once the launch switch is open,
 * About, Questions, Contact, Sign in once it is open too). On a phone the
 * groups fold, their links still in the page. Under them, who makes Saroh
 * with the copyright line (the year the site was built), "Bought from a
 * business on Saroh?" to /customers (DEC-121), always, and the legal pages
 * that are published (R6), with "Cookie choices" where the cookie notice
 * can appear.
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
    const developers = resources.find((r) => r.href === "/developers");
    const product = productGroup(developers);
    const named = new Set(product.map((l) => l.href));
    const groups: FooterGroup[] = [
        { title: FOOTER_WORDS.product, links: product },
        {
            title: FOOTER_WORDS.more,
            links: featureList
                .filter((f) => !named.has(featureHref(f.slug)))
                .map((f) => ({ name: f.name, href: featureHref(f.slug) })),
        },
        { title: FOOTER_WORDS.trades, links: solutions },
        // Developers is in Product, as API and webhooks.
        {
            title: FOOTER_WORDS.resources,
            links: resources.filter((r) => r !== developers),
        },
        { title: FOOTER_WORDS.tools, links: tools },
        {
            title: FOOTER_WORDS.saroh,
            links: [
                ...(LAUNCH_MODE === "open"
                    ? [{ name: NAV_WORDS.pricing, href: "/pricing" }]
                    : []),
                { name: ABOUT.name, href: ABOUT.href },
                { name: FOOTER_WORDS.questions, href: "/#faq" },
                // The Contact page gives contact@saroh.in (DEC-101) and a
                // form (DEC-137).
                { name: CONTACT_PAGE.name, href: CONTACT_PAGE.href },
                ...(LAUNCH_MODE === "open"
                    ? [{ name: NAV_WORDS.signIn, href: SIGN_IN_URL }]
                    : []),
            ],
        },
    ];
    return (
        <MarketingFooter
            line={FOOTER_WORDS.line}
            brand={
                <FooterBrand
                    motto={SAROH_NAME.line}
                    word={SAROH_NAME.word}
                    parts={SAROH_NAME.parts}
                    socials={SAROH_SOCIAL}
                />
            }
            groups={groups}
            note={`${MADE_BY}. © ${new Date().getFullYear()}. All rights reserved.`}
            legal={
                <>
                    {/* For a business's customers (DEC-121): always here,
                        since a paid merchant site links to Saroh nowhere. */}
                    <Link href={CUSTOMERS.href} className={LINK}>
                        {CUSTOMERS.footerLabel}
                    </Link>
                    {legal.map((page) => (
                        <Link key={page.href} href={page.href} className={LINK}>
                            {page.name}
                        </Link>
                    ))}
                    {cookieChoices ? (
                        <CookieChoicesButton className={`${LINK} ${ring()}`} />
                    ) : null}
                </>
            }
        />
    );
}
