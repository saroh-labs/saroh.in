import { ButtonLink } from "@saroh/marketing/button";
import type { ClaimSwitch } from "@saroh/marketing/feature-switches";
import { HomeChapters } from "@saroh/marketing/home/home-chapters";
import {
    PlansAndQuestions,
    YoursLine,
} from "@saroh/marketing/home/home-endings";
import { HERO_CTA_ID, HomeHero } from "@saroh/marketing/home/home-hero";
import { HomeTools } from "@saroh/marketing/home/home-tools";
import { TourVideo } from "@saroh/marketing/home/tour-video";
import { ClosingCTA } from "@saroh/marketing/kit/closing-cta";
import { StickyBar } from "@saroh/marketing/kit/sticky-bar";

import { SITE_FONTS } from "@/components/feature-pages/site-fonts";
import { JsonLd } from "@/components/shared/json-ld";
import { HOME_FAQ } from "@/content/faq";
import { featureList } from "@/content/features";
import { homeWords, TOUR_LABEL, TOUR_VIDEO } from "@/content/home";
import {
    HOME_HERO_SCENES,
    HOME_SITE_SHOWCASE,
    THISTLEWICK_TUESDAY as STORY,
    WORLD,
} from "@/content/world";
import { claimsOff, featuresOff } from "@/lib/feature-switches";
import { ALL_TOOLS, HOW_IT_WORKS_ALL } from "@/lib/nav";
import { StartLink } from "@/lib/page-site";
import {
    faqWithPlans,
    freePlanLine,
    paidPlansOn,
    readPricing,
} from "@/lib/plans";
import { faqSchema, pageSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { pageOf } from "@/lib/site-map";

const page = pageOf("/");

export const metadata = pageMetadata(page);

/**
 * `/`, saroh.in's landing in Global's words (DEC-221; LAHomeDesk and
 * LAHomePhone2, one responsive page): the same shared sections, fed by
 * `content/home.ts` and Thistlewick Bakery's Tuesday (`content/world.ts`).
 * The free tools stay: tools are how people arrive here. The plan line
 * follows the paid-plans switch (`plan-words.ts`), and the `*-plans`
 * claims stay off. Its links don't prefetch: the site is static HTML.
 *
 * The pricing teaser is the plan line (`#pricing`, its cards on /pricing),
 * the SAROH acronym headline is the share card's title. The door to a day
 * and the folded feature grid went on both sites (owner, 16 Nov 2026).
 */
export default async function HomePage() {
    const pricing = await readPricing();
    const catalog = pricing?.catalog ?? null;
    const plansOn = await paidPlansOn(pricing);
    const home = homeWords(plansOn);
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
        plansOn,
    );

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

            {/* The tools are document templates here, not site templates: no gallery link. */}
            <HomeChapters
                home={home}
                news={news}
                anyNews={anyNews}
                showcase={HOME_SITE_SHOWCASE}
                templates={false}
                business={WORLD.lead}
                story={STORY}
            />

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
