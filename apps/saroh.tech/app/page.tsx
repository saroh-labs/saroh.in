import { ButtonLink } from "@saroh/marketing/button";
import { CardLink } from "@saroh/marketing/card-link";
import { Container } from "@saroh/marketing/container";
import type { SolutionSlug } from "@saroh/marketing/content-types";
import type { ClaimSwitch } from "@saroh/marketing/feature-switches";
import type { DoorOption } from "@saroh/marketing/home/day-door";
import { DayDoor } from "@saroh/marketing/home/day-door";
import { Fold } from "@saroh/marketing/home/fold";
import {
    PlansAndQuestions,
    YoursLine,
} from "@saroh/marketing/home/home-endings";
import { HERO_CTA_ID, HomeHero } from "@saroh/marketing/home/home-hero";
import { MoneyBand } from "@saroh/marketing/home/money-band";
import { NewInSaroh } from "@saroh/marketing/home/new-in-saroh";
import { OrdersChapter } from "@saroh/marketing/home/orders-chapter";
import { SiteChapter } from "@saroh/marketing/home/site-chapter";
import { TourVideo } from "@saroh/marketing/home/tour-video";
import { Chip } from "@saroh/marketing/kit/chip";
import { ClosingCTA } from "@saroh/marketing/kit/closing-cta";
import { StickyBar } from "@saroh/marketing/kit/sticky-bar";
import { Section } from "@saroh/marketing/section";
import { TextLink } from "@saroh/marketing/text-link";

import { SITE_FONTS } from "@/components/feature-pages/site-fonts";
import { JsonLd } from "@/components/shared/json-ld";
import { HOME_FAQ } from "@/content/faq";
import { featureHref, featureList } from "@/content/features";
import { home, TOUR_LABEL, TOUR_VIDEO } from "@/content/home";
import { solutionHref, solutionList, solutions } from "@/content/solutions";
import {
    HOME_HERO_SCENES,
    HOME_SITE_SHOWCASE,
    THISTLEWICK_TUESDAY as STORY,
    WORLD,
} from "@/content/world";
import { claimsOff } from "@/lib/feature-switches";
import { ALL_TOOLS } from "@/lib/nav";
import { StartLink } from "@/lib/page-site";
import { faqWithPlans, freePlanLine, readCatalog } from "@/lib/plans";
import { faqSchema, pageSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { pageOf } from "@/lib/site-map";

const page = pageOf("/");

export const metadata = pageMetadata(page);

/** The door's picker: Global has no written day yet, so each trade's page. */
function doorOptions(): DoorOption[] {
    const go = (slug: SolutionSlug) => ({
        link: solutions[slug].card.link,
        href: solutionHref(slug),
    });
    return [
        { id: "bakery", label: "Bakery", ...go("shops") },
        { id: "salon", label: "Salon", ...go("salons") },
        { id: "gym", label: "Gym", ...go("gyms") },
    ];
}

/**
 * `/`, saroh.in's landing in Global's words (DEC-221; LAHomeDesk and
 * LAHomePhone2, one responsive page): the same shared sections, fed by
 * `content/home.ts` and Thistlewick Bakery's Tuesday (`content/world.ts`).
 * The free tools stay: tools are how people arrive here. Every business is
 * on Free, so the plan line says so with "Tell me when", and the `*-plans`
 * claims stay off. Its links don't prefetch: the site is static HTML.
 *
 * Moved, not cut (rule 15): the feature grid folds under "Everything in
 * Saroh" (`#features`), the solution cards under the door (`#solutions`,
 * with "Works for"), the pricing teaser is the plan line (`#pricing`, its
 * cards on /pricing), the SAROH acronym headline is the share card's title.
 */
export default async function HomePage() {
    const catalog = await readCatalog();
    const off = claimsOff();
    const claimOn = (c: ClaimSwitch) => !off.includes(c);
    const shown = new Set<string>(featureList.map((f) => f.slug));
    const news = {
        askAi: shown.has("ask-ai"),
        share: shown.has("social"),
        aiApps: shown.has("ai-apps"),
        // No API page on Global yet.
        api: false,
        claims: {
            askAiPlans: false,
            askAiLanguages: false,
            askAiWebsite: claimOn("ask-ai-website"),
            shareFree: claimOn("share-every-plan"),
            socialPosting: claimOn("social-posting"),
        },
    };
    const anyNews = news.askAi || news.share || news.aiApps;
    const faq = faqWithPlans(
        catalog,
        HOME_FAQ.filter((id) => id !== "ai-apps" || shown.has("ai-apps")),
    );
    const paidTotal =
        WORLD.lead.orders?.find((o) => o.id === STORY.paidOrder)?.total ?? "";

    return (
        <div data-page-type={page.type} className={SITE_FONTS}>
            <JsonLd
                data={[
                    ...pageSchema(page),
                    faqSchema(
                        faq.map(({ q, a }) => ({ question: q, answer: a })),
                    ),
                ]}
            />
            <HomeHero
                words={home}
                scenes={HOME_HERO_SCENES}
                start={<StartLink src="home-hero" />}
                tour={TOUR_VIDEO ? TOUR_LABEL : null}
            />
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

            {/* The tools are document templates here, not site templates: no gallery link. */}
            <SiteChapter
                words={home.site}
                showcase={HOME_SITE_SHOWCASE}
                templates={false}
            />
            <OrdersChapter
                words={home.orders}
                business={WORLD.lead}
                rows={STORY.todayRows}
                cls={STORY.class}
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
                                    href={solutionHref(s.slug)}
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
                                            href={solutionHref(s.slug)}
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
                    story={STORY}
                />
            </div>

            <YoursLine
                words={home}
                features={featureList.map((f) => ({
                    href: featureHref(f.slug),
                    name: f.name,
                    body: f.homeBody,
                    isNew: false,
                }))}
            />

            <Section
                id="tools"
                titleId="tools-title"
                title={home.toolsTitle}
                lead={home.toolsLead}
                size="kit-h2"
                className="grid scroll-mt-24 gap-6 pt-12 min-[760px]:pt-[72px]"
            >
                <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-4">
                    {home.tools.map((tool) => (
                        <CardLink
                            key={tool.href}
                            href={tool.href}
                            prefetch={false}
                            title={tool.title}
                            body={tool.line}
                            className={
                                "desk" in tool ? "hidden md:grid" : undefined
                            }
                        />
                    ))}
                </div>
                <TextLink
                    href={ALL_TOOLS.href}
                    tone="ink"
                    arrow
                    className="justify-self-start text-[15px]"
                >
                    {ALL_TOOLS.name}
                </TextLink>
            </Section>

            <PlansAndQuestions
                words={home}
                planLede={freePlanLine(catalog)}
                planLine={home.plans.start}
                start={<StartLink src="home-pricing" />}
                faq={faq}
            />

            <ClosingCTA
                title={home.closer}
                primary={<StartLink src="home-band" />}
                secondary={
                    <ButtonLink href="/features" variant="secondary" size="kit">
                        {home.how.label}
                    </ButtonLink>
                }
            />
            <StickyBar watch={HERO_CTA_ID}>
                <StartLink src="home-sticky" className="w-full" />
            </StickyBar>
        </div>
    );
}
