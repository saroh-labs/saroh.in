import type { FeatureSlug } from "@saroh/marketing/content-types";
import type { PageSite } from "@saroh/marketing/feature-pages/site";

import { CtaLink } from "@/components/shared/buttons/cta-link";
import { shotView } from "@/components/shared/media/shot-view";
import { featureHref, featureList } from "@/content/features";
import type { ShotKey } from "@/content/shots";
import { claimOn } from "@/lib/feature-switches";
import { LAUNCH_MODE } from "@/lib/links";

/**
 * What the shared pages need from saroh.in (`PageSite`): the `cta()` start
 * button, the claim switches, the launch switch, the feature pages this
 * build shows and the shot manifest.
 */
export function pageSite(): PageSite {
    const shown = new Set<string>(featureList.map((f) => f.slug));
    return {
        start: (src, className) => (
            <CtaLink src={src} size="kit" className={className} />
        ),
        claimOn: (claim) => claimOn(claim),
        open: LAUNCH_MODE === "open",
        featureHref: (slug) =>
            shown.has(slug) ? featureHref(slug as FeatureSlug) : null,
        shot: (key, alt, phone) =>
            key
                ? shotView(key as ShotKey, alt, phone as ShotKey | undefined)
                : undefined,
    };
}
