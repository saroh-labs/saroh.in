import type { Metadata } from "next";
import localFont from "next/font/local";

import { HomeHero } from "@/components/home/home-hero";
import { CtaLink } from "@/components/shared/buttons/cta-link";
import { JsonLd } from "@/components/shared/layout/json-ld";
import { menusList } from "@/components/shared/layout/site-chrome";
import { HOME_FAQ } from "@/content/faq";
import { featureList } from "@/content/features";
import { home, TOUR_VIDEO } from "@/content/home";
import { NAV_WORDS } from "@/content/nav";
import { shownResources } from "@/content/resources";
import { HOME_SITE_SHOWCASE, RYE_MONDAY, WORLD } from "@/content/world";
import { claimOn } from "@/lib/feature-switches";
import { LAUNCH_MODE } from "@/lib/links";
import { HOME_OG_ALT } from "@/lib/og-card";
import { faqWithPlans, freePlanLine } from "@/lib/plan-teasers";
import { readLivePricing } from "@/lib/pricing";
import { resourcesContext } from "@/lib/resources-context";
import {
    footerToolLinks,
    publishList,
    shownToolLinks,
    TOOLS_HUB,
} from "@/lib/search-pages";
import { pageMetadata, pageTitle } from "@/lib/seo";
import {
    faqPageLd,
    organizationLd,
    softwareApplicationLd,
    webSiteLd,
} from "@/lib/structured-data";
import { ButtonLink } from "@saroh/marketing/button";
import { Container } from "@saroh/marketing/container";
import {
    PlansAndQuestions,
    YoursLine,
} from "@saroh/marketing/home/home-endings";
import { HERO_CTA_ID } from "@saroh/marketing/home/home-hero";
import { HomeTools } from "@saroh/marketing/home/home-tools";
import { MoneyBand } from "@saroh/marketing/home/money-band";
import { NewInSaroh } from "@saroh/marketing/home/new-in-saroh";
import { OrdersChapter } from "@saroh/marketing/home/orders-chapter";
import { SiteChapter } from "@saroh/marketing/home/site-chapter";
import { TourVideo } from "@saroh/marketing/home/tour-video";
import { Chip } from "@saroh/marketing/kit/chip";
import { Claim } from "@saroh/marketing/kit/claim";
import { ClosingCTA } from "@saroh/marketing/kit/closing-cta";
import { StickyBar } from "@saroh/marketing/kit/sticky-bar";

/**
 * `/`, the landing (DEC-221; boards LAHomeDesk and LAHomePhone2, one
 * responsive page): the hero with its three phones and trade switcher, the
 * website and orders chapters, the money band, New in Saroh, the "stays
 * yours" line, the free tools, plans and questions, and the close (the
 * door to a day and the folded feature grid went, owner, 16 Nov 2026).
 *
 * Moved, not cut (rule 15): the feature grid is folded under "Everything in
 * Saroh" (`#features`); the Solutions cards under the door (`#solutions`);
 * the plan cards are /pricing's, this page keeps the plan line (`#pricing`);
 * the acronym line is the share card's title.
 *
 * Before the launch switch opens the catalogue isn't read at all (DEC-136):
 * one published ahead of launch must not put a plan's name or price in the
 * answers or the structured data, and no plan or Pricing link is drawn.
 */

// The example sites wear their own fonts, never Saroh's.
const siteSerif = localFont({
    src: "../../../../packages/site-blocks/fonts/fraunces/Fraunces-wght-latin.woff2",
    weight: "400 700",
    variable: "--font-site-serif",
});
const siteSans = localFont({
    src: "../../../../packages/site-blocks/fonts/figtree/Figtree-400-700-latin.woff2",
    weight: "400 700",
    variable: "--font-site-sans",
});

export const metadata: Metadata = pageMetadata({
    title: pageTitle(home.seoTitle),
    socialTitle: home.titleLabel,
    description: home.seoDescription,
    path: "/",
    image: { url: "/opengraph-image", alt: HOME_OG_ALT },
});

/**
 * The landing's six free tools: the footer's five most asked-for, then the
 * next, of the tools this build shows (every one on a local preview).
 */
function homeTools() {
    const ctx = resourcesContext();
    const shown = shownToolLinks(ctx, menusList(publishList(), ctx.preview));
    const first = footerToolLinks(shown);
    return [...first, ...shown.filter((t) => !first.includes(t))].slice(0, 6);
}

export default async function HomePage() {
    const open = LAUNCH_MODE === "open";
    const catalog = open ? await readLivePricing() : null;
    const shown = new Set(featureList.map((f) => f.slug));
    const resources = new Set(
        shownResources(resourcesContext()).map((p) => p.href),
    );
    const templates = resources.has("/templates");
    const news = {
        askAi: shown.has("ask-ai"),
        share: shown.has("social"),
        aiApps: shown.has("ai-apps"),
        api: resources.has("/developers"),
        claims: {
            askAiPlans: open && claimOn("ask-ai-plans"),
            askAiLanguages: claimOn("ask-ai-languages"),
            askAiWebsite: claimOn("ask-ai-website"),
            shareFree: claimOn("share-every-plan"),
            socialPosting: claimOn("social-posting"),
        },
    };
    const paidTotal =
        WORLD.lead.orders?.find((o) => o.id === RYE_MONDAY.paidOrder)?.total ??
        "";
    const anyNews = news.askAi || news.share || news.aiApps || news.api;
    const faq = faqWithPlans(
        catalog,
        HOME_FAQ.filter((id) => id !== "ai-apps" || shown.has("ai-apps")),
    );

    return (
        <div className={`${siteSerif.variable} ${siteSans.variable}`}>
            <JsonLd
                data={[
                    organizationLd(),
                    webSiteLd(),
                    softwareApplicationLd(catalog, home.seoDescription),
                    // The very answers drawn under Questions, so the two never drift.
                    faqPageLd(faq),
                ]}
            />
            <HomeHero />
            <TourVideo video={TOUR_VIDEO} />

            <Container
                as="nav"
                aria-label={home.chapters.label}
                className="pt-5 min-[760px]:hidden"
            >
                <ul className="m-0 -mr-mk-gutter flex list-none gap-2 overflow-x-auto p-0 pr-mk-gutter [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {home.chapters.items
                        .filter((c) => c.href !== "#new" || anyNews)
                        .map((c) => (
                            <li key={c.href}>
                                <Chip variant="chapter" href={c.href}>
                                    {c.label}
                                </Chip>
                            </li>
                        ))}
                </ul>
            </Container>

            <SiteChapter
                words={home.site}
                showcase={HOME_SITE_SHOWCASE}
                templates={templates}
            />
            <OrdersChapter
                words={home.orders}
                business={WORLD.lead}
                rows={RYE_MONDAY.todayRows}
                cls={RYE_MONDAY.class}
            />
            <MoneyBand
                words={home.money}
                chips={home.chips}
                amount={paidTotal}
            />

            {/* Straight after the money band: the door that sat between went (16 Nov 2026). */}
            <NewInSaroh
                on={news}
                words={home.news}
                business={WORLD.lead}
                story={RYE_MONDAY}
            />

            <YoursLine
                words={{ ...home, allFeatures: NAV_WORDS.howItWorksAll }}
            />

            <HomeTools
                title={home.toolsTitle}
                lead={home.toolsLead}
                tools={homeTools().map((t, i) => ({
                    title: t.name,
                    line: t.line,
                    href: t.href,
                    desk: i >= 4,
                }))}
                all={{ name: "See all free tools", href: TOOLS_HUB.path }}
            />

            <PlansAndQuestions
                words={home}
                planLede={catalog ? freePlanLine(catalog) : home.plans.lede}
                planLine={
                    open ? (
                        <>
                            {home.plans.start}{" "}
                            <Claim
                                on={
                                    shown.has("ask-ai") &&
                                    claimOn("ask-ai-plans")
                                }
                            >
                                {home.plans.askAi}
                            </Claim>
                        </>
                    ) : null
                }
                start={<CtaLink src="home-pricing" size="kit" />}
                faq={faq}
            />

            <ClosingCTA
                title={home.closer}
                primary={<CtaLink src="home-band" size="kit" />}
                // The same second step as saroh.tech's (owner, 16 Nov 2026, #16).
                secondary={
                    <ButtonLink href="/features" variant="secondary" size="kit">
                        {home.how.label}
                    </ButtonLink>
                }
            />
            <StickyBar watch={HERO_CTA_ID}>
                <CtaLink src="home-sticky" size="kit" className="w-full" />
            </StickyBar>
        </div>
    );
}
