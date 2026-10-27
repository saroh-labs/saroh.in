import Link from "next/link";

import type { Feature } from "@/content/types";
import { ring } from "@/lib/ring";

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
            crumb={
                <nav aria-label="Breadcrumb">
                    <ol className="m-0 flex list-none items-center gap-2 p-0 text-[14px] text-muted-foreground">
                        <li>
                            <Link
                                href="/#features"
                                className={`cursor-pointer rounded-sm text-muted-foreground no-underline transition-colors duration-fast ease-out hover:text-foreground ${ring()}`}
                            >
                                Features
                            </Link>
                        </li>
                        <li aria-hidden>/</li>
                        <li
                            aria-current="page"
                            className="font-semibold text-brand-700"
                        >
                            {feature.name}
                        </li>
                    </ol>
                </nav>
            }
            headline={feature.headline}
            sub={feature.sub}
            narrow
            actions={{ src: `feature-${feature.slug}` }}
            freeLine={freeLine}
            shot={feature.hero}
        />
    );
}
