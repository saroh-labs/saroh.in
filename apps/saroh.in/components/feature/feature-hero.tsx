import { ProductHero } from "@saroh/marketing/product-hero";

import type { Feature } from "@/content/types";

import { HeroActions } from "../shared/buttons/hero-actions";
import { shotView } from "../shared/media/shot-view";

/**
 * A feature page's opening (Features template), drawn by `ProductHero`: the
 * "Features / {name}" breadcrumb, then the feature's words and screenshot.
 * The free-plan line comes from the pricing catalogue, the placeholder line
 * without one (the public-repo rule).
 */
export function FeatureHero({
    feature,
    freeLine,
}: {
    feature: Feature;
    /** The free-plan line, from the catalogue (`freePlanLine`). */
    freeLine: string;
}) {
    return (
        <ProductHero
            section={{ name: "Features", href: "/#features" }}
            name={feature.name}
            headline={feature.headline}
            sub={feature.sub}
            narrow
            actions={<HeroActions src={`feature-${feature.slug}`} />}
            freeLine={freeLine}
            shot={shotView(feature.hero.shot, feature.hero.alt)}
        />
    );
}
