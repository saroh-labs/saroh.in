import type { ShotKey } from "@saroh/marketing/content-types";
import { KeepPage as Keep } from "@saroh/marketing/feature-pages/keep-page";
import { OrdersMoments } from "@saroh/marketing/feature-pages/orders-moments";

import type { KeepSlug } from "@/content/feature-keep";
import { KEEP, KEEP_WORDS } from "@/content/feature-keep";
import { ORDERS_MOMENTS } from "@/content/feature-orders";
import { featureHref, features, NOT_AVAILABLE_YET } from "@/content/features";
import { HELP } from "@/content/help";
import { shotView } from "@/content/shots";
import { WORLD } from "@/content/world";
import { featuresOff } from "@/lib/feature-switches";
import { pageSite } from "@/lib/page-site";
import { freePlanLine, readCatalog } from "@/lib/plans";

/** A key's shot, or the neutral frame of a pending one (never nothing in a Keep slot). */
const shot = (key: ShotKey, alt?: string) =>
    shotView(key, alt) ?? {
        id: key,
        image: { src: null, alt: alt ?? key, width: 1600, height: 1000 },
        alt,
    };

/**
 * A record feature's page on saroh.tech (DEC-221 "Keep"; saroh.in's
 * FODesk/FOPhone2 template, shared from `@saroh/marketing`): Global's words
 * (`content/features.ts`, every word the page had), Thistlewick's facts,
 * the same shot keys as saroh.in in the same slots. A Limited page says
 * what works today in place of the hero note; a Coming soon page marks
 * every step and point "Not available yet". There is no written Global day,
 * so no day button. No plan is on sale: the plan line is the
 * free plan's, with "Tell me when".
 */
export async function KeepPage({ slug }: { slug: KeepSlug }) {
    const feature = features[slug];
    const words = KEEP_WORDS[slug];
    const catalog = await readCatalog();
    const live = new Set(HELP.map((a) => a.slug));
    const ask =
        words.ask && !featuresOff().includes("ask-ai")
            ? {
                  ...words.ask,
                  href: featureHref("ask-ai"),
                  exchanges: words.ask.exchanges.map((x) => {
                      const o = WORLD.lead.orders?.find(
                          (r) => r.id === x.order?.id,
                      );
                      return {
                          ...x,
                          order:
                              o && x.order
                                  ? {
                                        id: o.id,
                                        customer: o.customer,
                                        total: o.total,
                                        note: x.order.note,
                                    }
                                  : undefined,
                      };
                  }),
              }
            : null;
    return (
        <Keep
            slug={slug}
            words={KEEP}
            site={pageSite()}
            feature={{
                ...feature,
                steps: feature.steps.map((step) => ({
                    title: step.title,
                    body: step.body,
                    who: step.who,
                    shot: shot(step.shot, step.alt),
                })),
                points: feature.points.map((p) => ({
                    title: p.title,
                    body: p.openNote ? `${p.body} ${p.openNote}` : p.body,
                })),
            }}
            mark={words.mark}
            scene={words.scene}
            hero={shot(feature.hero.shot, feature.hero.alt)}
            day={null}
            help={words.help
                .filter((h) => live.has(h.slug))
                .map((h) => ({ href: `/help/${h.slug}`, label: h.label }))}
            ask={ask}
            planLine={freePlanLine(catalog)}
            compareHref="/pricing"
            faq={words.faq}
            note={feature.state === "full" ? undefined : feature.worksToday}
            notYet={
                feature.state === "coming-soon" ? NOT_AVAILABLE_YET : undefined
            }
            moments={
                slug === "orders" ? (
                    <OrdersMoments data={ORDERS_MOMENTS} />
                ) : null
            }
        />
    );
}
