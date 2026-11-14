import { ButtonLink } from "@saroh/marketing/button";
import { ProductHero } from "@saroh/marketing/product-hero";
import type { Catalog } from "@saroh/pricing-catalog";
import { cellOf, offeredPlans } from "@saroh/pricing-catalog";

import type { Feature, FeatureSlug } from "@/content/types";
import { sentenceList } from "@/lib/format/list";
import { freePlanLine } from "@/lib/plan-teasers";

import { HeroActions } from "../shared/buttons/hero-actions";
import { shotView } from "../shared/media/shot-view";

/**
 * The features that come with some plans only, by their catalogue module:
 * the hero names those plans instead of the free-plan line (board VFAskAi).
 */
const PLAN_MODULE: Partial<Record<FeatureSlug, string>> = {
    "ask-ai": "ask-ai",
};

/**
 * The line under the hero's buttons: "{Name} comes with Grow and Pro." for
 * a feature only some plans have, with the plan names read from the
 * catalogue; otherwise, or without a catalogue, the free-plan line.
 */
export function heroPlanLine(
    feature: Feature,
    catalog: Catalog | null,
): string {
    const id = PLAN_MODULE[feature.slug];
    const m = id ? catalog?.modules.find((x) => x.id === id) : undefined;
    if (!catalog || !m || m.pricing === "hidden") return freePlanLine(catalog);
    const plans = offeredPlans(catalog);
    const on = plans.filter((p) => cellOf(m, p.id).inc);
    // On every plan, or on none: the free-plan line says it as well.
    if (!on.length || on.length === plans.length) return freePlanLine(catalog);
    return `${feature.name} comes with ${sentenceList(on.map((p) => p.name))}.`;
}

/**
 * A feature page's opening (Features template), drawn by `ProductHero`: the
 * "Features / {name}" breadcrumb, then the feature's words and screenshot.
 * The line under the buttons comes from the pricing catalogue
 * (`heroPlanLine`), the placeholder line without one (the public-repo rule).
 * A hero in another company's app (`heroChat`, AI apps) is drawn, not shot.
 */
export function FeatureHero({
    feature,
    catalog,
}: {
    feature: Feature;
    /** The published catalogue, or null before launch or without one. */
    catalog: Catalog | null;
}) {
    const line = heroPlanLine(feature, catalog);
    const start = <HeroActions src={`feature-${feature.slug}`} />;
    return (
        <ProductHero
            section={{ name: "Features", href: "/#features" }}
            name={feature.name}
            headline={feature.headline}
            sub={feature.sub}
            narrow
            actions={
                // A feature on some plans only names them, and links them (board VFAskAi).
                line === freePlanLine(catalog) ? (
                    start
                ) : (
                    <div className="flex flex-wrap gap-3">
                        {start}
                        <ButtonLink href="/pricing" variant="secondary">
                            See plans
                        </ButtonLink>
                    </div>
                )
            }
            freeLine={line}
            shot={shotView(feature.hero.shot, feature.hero.alt)}
            chat={feature.heroChat}
        />
    );
}
