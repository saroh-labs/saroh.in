import { ButtonLink } from "@saroh/marketing/button";
import { Container } from "@saroh/marketing/container";
import type { ClaimSwitch } from "@saroh/marketing/feature-switches";
import {
    PlansAndQuestions,
    YoursLine,
} from "@saroh/marketing/home/home-endings";
import { HERO_CTA_ID, HomeHero } from "@saroh/marketing/home/home-hero";
import { HomeTools } from "@saroh/marketing/home/home-tools";
import { MoneyBand } from "@saroh/marketing/home/money-band";
import { NewInSaroh } from "@saroh/marketing/home/new-in-saroh";
import { OrdersChapter } from "@saroh/marketing/home/orders-chapter";
import { SiteChapter } from "@saroh/marketing/home/site-chapter";
import { TourVideo } from "@saroh/marketing/home/tour-video";
import { Chip } from "@saroh/marketing/kit/chip";
import { ClosingCTA } from "@saroh/marketing/kit/closing-cta";
import { StickyBar } from "@saroh/marketing/kit/sticky-bar";

import { SITE_FONTS } from "@/components/feature-pages/site-fonts";
import { JsonLd } from "@/components/shared/json-ld";
import { HOME_FAQ } from "@/content/faq";
import { featureList } from "@/content/features";
import { home, TOUR_LABEL, TOUR_VIDEO } from "@/content/home";
import {
    HOME_HERO_SCENES,
    HOME_SITE_SHOWCASE,
    THISTLEWICK_TUESDAY as STORY,
    WORLD,
} from "@/content/world";
import { claimsOff, featuresOff } from "@/lib/feature-switches";
import { ALL_TOOLS, HOW_IT_WORKS_ALL } from "@/lib/nav";
import { StartLink } from "@/lib/page-site";
import { faqWithPlans, freePlanLine, readPricing } from "@/lib/plans";
import { faqSchema, pageSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { pageOf } from "@/lib/site-map";

const page = pageOf("/");

export const metadata = pageMetadata(page);

/**
 * `/`, saroh.in's landing in Global's words (DEC-221; LAHomeDesk and
 * LAHomePhone2, one responsive page): the same shared sections, fed by
 * `content/home.ts` and Thistlewick Bakery's Tuesday (`content/world.ts`).
 * The free tools stay: tools are how people arrive here. Every business is
 * on Free, so the plan line says so with "Tell me when", and the `*-plans`
 * claims stay off. Its links don't prefetch: the site is static HTML.
 *
 * The pricing teaser is the plan line (`#pricing`, its cards on /pricing),
 * the SAROH acronym headline is the share card's title. The door to a day
 * and the folded feature grid went on both sites (owner, 16 Nov 2026).
 */
export default async function HomePage() {
    const pricing = await readPricing();
    const catalog = pricing?.catalog ?? null;
    const off = claimsOff();
    const claimOn = (c: ClaimSwitch) => !off.includes(c);
    const shown = new Set<string>(featureList.map((f) => f.slug));
    const news = {
        askAi: shown.has("ask-ai"),
        share: shown.has("social"),
        aiApps: shown.has("ai-apps"),
        // While /developers is on, as on saroh.in (owner, 16 Nov 2026, #13).
        api: !featuresOff().includes("developers"),
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
        pricing?.cardOnline,
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

            <div className="mt-16 min-[760px]:mt-20">
                <NewInSaroh
                    on={news}
                    words={home.news}
                    business={WORLD.lead}
                    story={STORY}
                />
            </div>

            <YoursLine
                words={{ ...home, allFeatures: HOW_IT_WORKS_ALL.name }}
            />

            <HomeTools
                title={home.toolsTitle}
                lead={home.toolsLead}
                tools={home.tools.map((t) => ({ ...t, desk: "desk" in t }))}
                all={ALL_TOOLS}
            />

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
