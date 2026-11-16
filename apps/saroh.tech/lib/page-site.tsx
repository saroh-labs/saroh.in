import { buttonClasses } from "@saroh/marketing/button";
import { cn } from "@saroh/marketing/cn";
import type { FeatureSlug, ShotKey } from "@saroh/marketing/content-types";
import type { PageSite } from "@saroh/marketing/feature-pages/site";
import Link from "next/link";

import { featureHref, featureList } from "@/content/features";
import { shotView } from "@/content/shots";
import { claimsOff } from "@/lib/feature-switches";
import { signupHref } from "@/site.config";

/** "Start free", the 48px kit button, to sign-up with the place it was pressed. */
export function StartLink({
    src,
    className,
}: {
    /** Where the sign-up came from, e.g. `feature-orders-band`. */
    src: string;
    className?: string;
}) {
    return (
        <Link
            prefetch={false}
            href={signupHref(src)}
            data-cta={
                src.endsWith("-band") ? "start-free-band" : "start-free-page"
            }
            className={cn(buttonClasses({ size: "kit" }), className)}
        >
            Start free
        </Link>
    );
}

/**
 * What the shared pages need from saroh.tech (`PageSite`): its start
 * button, its claim switches, the feature pages this build shows and its
 * shots. Global has no launch gate: Pricing is always there, but no paid
 * plan is on sale (DEC-211), so the `*-plans` claims stay off.
 */
export function pageSite(): PageSite {
    const off = claimsOff();
    const shown = new Set<string>(featureList.map((f) => f.slug));
    return {
        start: (src, className) => (
            <StartLink src={src} className={className} />
        ),
        claimOn: (claim) => !off.includes(claim),
        open: true,
        featureHref: (slug) =>
            shown.has(slug) ? featureHref(slug as FeatureSlug) : null,
        shot: (key, alt) => shotView(key as ShotKey | undefined, alt),
    };
}
