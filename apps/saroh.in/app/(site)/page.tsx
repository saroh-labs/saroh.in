import type { Metadata } from "next";
import localFont from "next/font/local";

import { HomeHero } from "@/components/home/home-hero";
import { CtaLink } from "@/components/shared/buttons/cta-link";
import { JsonLd } from "@/components/shared/layout/json-ld";
import { HOME_FAQ } from "@/content/faq";
import { featureHref, featureList, NEW_FEATURES } from "@/content/features";
import { home, TOUR_VIDEO } from "@/content/home";
import { shownResources } from "@/content/resources";
import { solutionList, solutions } from "@/content/solutions";
import { HOME_SITE_SHOWCASE, RYE_MONDAY, WORLD } from "@/content/world";
import { claimOn } from "@/lib/feature-switches";
import { LAUNCH_MODE } from "@/lib/links";
import { HOME_OG_ALT } from "@/lib/og-card";
import { faqWithPlans, freePlanLine } from "@/lib/plan-teasers";
import { readLivePricing } from "@/lib/pricing";
import { resourcesContext } from "@/lib/resources-context";
import { isPublished, solutionLink } from "@/lib/search-pages";
import { pageMetadata, pageTitle } from "@/lib/seo";
import {
    faqPageLd,
    organizationLd,
    softwareApplicationLd,
    webSiteLd,
} from "@/lib/structured-data";
import { ButtonLink } from "@saroh/marketing/button";
import { Container } from "@saroh/marketing/container";
import type { DoorOption } from "@saroh/marketing/home/day-door";
import { DayDoor } from "@saroh/marketing/home/day-door";
import { Fold } from "@saroh/marketing/home/fold";
import {
    PlansAndQuestions,
    YoursLine,
} from "@saroh/marketing/home/home-endings";
import { HERO_CTA_ID } from "@saroh/marketing/home/home-hero";
import { MoneyBand } from "@saroh/marketing/home/money-band";
import { NewInSaroh } from "@saroh/marketing/home/new-in-saroh";
import { OrdersChapter } from "@saroh/marketing/home/orders-chapter";
import { SiteChapter } from "@saroh/marketing/home/site-chapter";
import { TourVideo } from "@saroh/marketing/home/tour-video";
import { Chip } from "@saroh/marketing/kit/chip";
import { Claim } from "@saroh/marketing/kit/claim";
import { ClosingCTA } from "@saroh/marketing/kit/closing-cta";
import { StickyBar } from "@saroh/marketing/kit/sticky-bar";
import { TextLink } from "@saroh/marketing/text-link";
import { dayLink } from "@saroh/marketing/world";

/**
 * `/`, the landing (DEC-221; boards LAHomeDesk and LAHomePhone2, one
 * responsive page): the hero with its three phones and trade switcher, the
 * website and orders chapters, the money band, the door to a whole day,
 * New in Saroh, the "stays yours" line, plans and questions, and the close.
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

/** The door's picker: a trade's written day where it is live, else its page. */
function doorOptions(): DoorOption[] {
    const days = [WORLD.lead, ...WORLD.others].flatMap((b) => {
        const first = b.day?.[0];
        return b.tradePage && first && isPublished(b.tradePage)
            ? [
                  {
                      trade: b.trade,
                      link: `${home.day.spend} ${b.name}`,
                      href: dayLink(b, first),
                  },
              ]
            : [];
    });
    const dayOf = (trade: string) => days.find((d) => d.trade === trade);
    const page = (slug: "shops" | "salons" | "gyms") => ({
        link: solutions[slug].card.link,
        href: solutionLink(slug),
    });
    const florist = dayOf("florist");
    return [
        {
            id: "bakery",
            label: "Bakery",
            ...(dayOf("bakery") ?? page("shops")),
        },
        { id: "salon", label: "Salon", ...page("salons") },
        { id: "gym", label: "Gym", ...page("gyms") },
        ...(florist ? [{ id: "florist", label: "Florist", ...florist }] : []),
    ];
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

            <Container
                as="section"
                id="day"
                className="scroll-mt-24 pt-10 min-[760px]:pt-16"
            >
                <DayDoor
                    title={home.day.title}
                    line={home.day.line}
                    legend={home.day.legend}
                    options={doorOptions()}
                >
                    <div
                        id="solutions"
                        className="mt-5 grid scroll-mt-24 gap-1 border-t border-border pt-4"
                    >
                        <nav
                            aria-label={home.worksFor}
                            // A phone: one row of chips that scrolls (PHONE.md).
                            className="flex flex-wrap items-center gap-2 max-[759px]:-mr-mk-gutter max-[759px]:flex-nowrap max-[759px]:overflow-x-auto max-[759px]:pr-mk-gutter max-[759px]:[scrollbar-width:none] [&>*]:shrink-0"
                        >
                            <span className="mr-1 text-[14px] text-muted-foreground">
                                {home.worksFor}
                            </span>
                            {solutionList.map((s) => (
                                <Chip
                                    key={s.slug}
                                    variant="filter"
                                    href={solutionLink(s.slug)}
                                >
                                    {s.card.name}
                                </Chip>
                            ))}
                        </nav>
                        <Fold summary={home.solutionsMore}>
                            <ul className="m-0 mt-2 grid list-none gap-5 p-0 min-[760px]:grid-cols-2">
                                {solutionList.map((s) => (
                                    <li key={s.slug} className="grid gap-1">
                                        <h3 className="m-0 font-display text-mk-kit-h3 font-bold">
                                            {s.card.name}
                                        </h3>
                                        <p className="m-0 text-[15px] leading-normal text-mk-copy">
                                            {s.card.body}
                                        </p>
                                        <p className="m-0 text-[13px] text-muted-foreground">
                                            {s.card.uses}
                                        </p>
                                        <TextLink
                                            href={solutionLink(s.slug)}
                                            tone="ink"
                                            arrow
                                            className="text-[15px]"
                                        >
                                            {s.card.link}
                                        </TextLink>
                                    </li>
                                ))}
                            </ul>
                        </Fold>
                    </div>
                </DayDoor>
            </Container>

            <div className="mt-16 min-[760px]:mt-20">
                <NewInSaroh
                    on={news}
                    words={home.news}
                    business={WORLD.lead}
                    story={RYE_MONDAY}
                />
            </div>

            <YoursLine
                words={home}
                features={featureList.map((f) => ({
                    href: featureHref(f.slug),
                    name: f.name,
                    body: f.homeBody,
                    isNew: NEW_FEATURES.includes(f.slug),
                }))}
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
                secondary={
                    templates ? (
                        <ButtonLink
                            href="/templates"
                            variant="secondary"
                            size="kit"
                        >
                            {home.templates}
                        </ButtonLink>
                    ) : (
                        <ButtonLink
                            href="/features"
                            variant="secondary"
                            size="kit"
                        >
                            {home.how.label}
                        </ButtonLink>
                    )
                }
            />
            <StickyBar watch={HERO_CTA_ID}>
                <CtaLink src="home-sticky" size="kit" className="w-full" />
            </StickyBar>
        </div>
    );
}
