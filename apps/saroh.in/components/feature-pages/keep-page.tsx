import {
    KeepPage as Keep,
    keepAsk,
} from "@saroh/marketing/feature-pages/keep-page";
import { OrdersMoments } from "@saroh/marketing/feature-pages/orders-moments";
import { hourLabel } from "@saroh/marketing/kit/time";
import type { WorldBusiness, WorldHour } from "@saroh/marketing/world";
import { dayLink } from "@saroh/marketing/world";

import { heroPlanLine } from "@/components/feature/feature-hero";
import { shotView } from "@/components/shared/media/shot-view";
import { featureHelpLinks } from "@/content/feature-help";
import type { KeepSlug } from "@/content/feature-keep";
import { KEEP, KEEP_WORDS } from "@/content/feature-keep";
import { ORDERS_MOMENTS } from "@/content/feature-orders";
import { featureHref, features } from "@/content/features";
import { summarise } from "@/content/help";
import { WORLD } from "@/content/world";
import { claimOn, featuresOff } from "@/lib/feature-switches";
import { helpArticles } from "@/lib/help-docs";
import { LAUNCH_MODE } from "@/lib/links";
import { pageSite } from "@/lib/page-site";
import { readLivePricing } from "@/lib/pricing";
import { resourcesContext } from "@/lib/resources-context";
import { isPublished } from "@/lib/search-pages";

/** The hero's day button: the page's own hour, else the world's hour for the feature. */
function momentOf(
    slug: KeepSlug,
): { business: WorldBusiness; hour: WorldHour } | null {
    const own = KEEP_WORDS[slug].moment;
    const lead = WORLD.lead;
    if (own) return { business: lead, hour: { at: own.at, line: own.line } };
    for (const business of [lead, ...WORLD.others]) {
        const hour = business.day?.find((h) => h.feature === slug);
        if (hour) return { business, hour };
    }
    return null;
}

/**
 * A record feature's page, India's (DEC-221 "Keep"): works out this site's
 * switches, catalogue, Help links, shots and world for the shared template
 * (`@saroh/marketing/feature-pages/keep-page`). Every word the page had
 * before stays (`content/features.ts`); the template's own words are in
 * `content/feature-keep.ts`.
 */
export async function KeepPage({ slug }: { slug: KeepSlug }) {
    const feature = features[slug];
    const words = KEEP_WORDS[slug];
    const catalog = LAUNCH_MODE === "open" ? await readLivePricing() : null;
    const context = resourcesContext();
    const help = featureHelpLinks(slug, helpArticles().map(summarise), context);
    const off = featuresOff();

    const moment = momentOf(slug);
    const day =
        moment?.business.tradePage && isPublished(moment.business.tradePage)
            ? {
                  href: dayLink(moment.business, moment.hour),
                  label: KEEP.secondary(
                      hourLabel(moment.hour.at),
                      moment.business.name,
                  ),
              }
            : null;

    const ask =
        words.ask && !off.includes("ask-ai")
            ? {
                  ...words.ask,
                  exchanges: words.ask.exchanges.filter((x) =>
                      (x.claims ?? []).every((c) => claimOn(c)),
                  ),
                  link:
                      !words.ask.link.claim || claimOn(words.ask.link.claim)
                          ? words.ask.link.label
                          : words.ask.link.fallback,
              }
            : null;

    // A point's plan note only once the launch switch is open (DEC-136).
    const points = feature.points.map((p) => ({
        title: p.title,
        body:
            LAUNCH_MODE === "open" && p.openNote
                ? `${p.body} ${p.openNote}`
                : p.body,
    }));
    return (
        <Keep
            slug={slug}
            words={KEEP}
            site={pageSite()}
            feature={{
                ...feature,
                steps: feature.steps.map((step) => ({
                    ...step,
                    shot: shotView(step.shot, step.alt),
                })),
                points,
            }}
            mark={words.mark}
            scene={words.scene}
            hero={shotView(feature.hero.shot, feature.hero.alt)}
            day={day}
            help={help}
            ask={
                ask
                    ? keepAsk(ask, featureHref("ask-ai"), WORLD.lead.orders)
                    : null
            }
            planLine={heroPlanLine(feature, catalog)}
            compareHref="/pricing"
            faq={words.faq}
            moments={
                slug === "orders" ? (
                    <OrdersMoments data={ORDERS_MOMENTS} />
                ) : null
            }
        />
    );
}
