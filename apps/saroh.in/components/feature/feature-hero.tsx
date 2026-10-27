import type { Feature } from "@/content/types";

import { ProductHero } from "../shared/sections/product-hero";

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
            actions={{ src: `feature-${feature.slug}` }}
            freeLine={freeLine}
            shot={feature.hero}
        />
    );
}
