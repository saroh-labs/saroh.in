import type { FeatureSlug, ShotKey } from "@saroh/marketing/content-types";
import { KeepPage as Keep } from "@saroh/marketing/feature-pages/keep-page";
import { OrdersMoments } from "@saroh/marketing/feature-pages/orders-moments";

import type { KeepSlug } from "@/content/feature-keep";
import { KEEP, KEEP_WORDS } from "@/content/feature-keep";
import { ORDERS_MOMENTS } from "@/content/feature-orders";
import {
    featureHref,
    featureList,
    features,
    NOT_AVAILABLE_YET,
} from "@/content/features";
import { HELP } from "@/content/help";
import { PAID_PLAN_FEATURES, planWords } from "@/content/plan-words";
import { shotView } from "@/content/shots";
import { solutionHref, solutions } from "@/content/solutions";
import { WORLD } from "@/content/world";
import { featuresOff } from "@/lib/feature-switches";
import { pageSite } from "@/lib/page-site";
import { freePlanLine, paidPlansOn, readPricing } from "@/lib/plans";

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
 * what works today in place of the hero note. A feature that comes with a
 * paid plan is tagged "On paid plans", with its note, while they aren't on
 * sale, and drawn as any other once they are (DEC-222). There is no written
 * Global day, so no day button or moment. The plan line is the free plan's;
 * its link follows the paid-plans switch (`plan-words.ts`).
 */
export async function KeepPage({ slug }: { slug: KeepSlug }) {
    const feature = features[slug];
    const words = KEEP_WORDS[slug];
    const read = await readPricing();
    const catalog = read?.catalog ?? null;
    const plan = planWords(await paidPlansOn(read));
    // A paid-plan feature is tagged until paid plans are on sale, then drawn as any other (DEC-222).
    const paid = PAID_PLAN_FEATURES.includes(slug);
    const shown = new Set<string>(featureList.map((f) => f.slug));
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
            words={{ ...KEEP, compare: plan.compare }}
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
            moment={null}
            help={words.help
                .filter((h) => live.has(h.slug))
                .map((h) => ({ href: `/help/${h.slug}`, label: h.label }))}
            around={feature.worksWith
                .filter((s: FeatureSlug) => shown.has(s))
                .map((s) => ({
                    href: featureHref(s),
                    name: features[s].name,
                    line: features[s].cardLine,
                }))}
            ask={ask}
            planLine={freePlanLine(catalog)}
            compareHref="/pricing"
            usedBy={feature.usedBy.map((s) => ({
                href: solutionHref(s),
                name: solutions[s].longName,
            }))}
            faq={words.faq}
            note={
                feature.state === "full" || (paid && !plan.paidTag)
                    ? undefined
                    : feature.worksToday
            }
            notYet={
                paid
                    ? plan.paidTag || undefined
                    : feature.state === "coming-soon"
                      ? NOT_AVAILABLE_YET
                      : undefined
            }
            moments={
                slug === "orders" ? (
                    <OrdersMoments data={ORDERS_MOMENTS} />
                ) : null
            }
        />
    );
}
