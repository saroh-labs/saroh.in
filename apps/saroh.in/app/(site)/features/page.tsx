import type { Metadata } from "next";

import { HowItWorksPage as HowItWorks } from "@saroh/marketing/how-it-works/how-it-works-page";
import type { Gate } from "@saroh/marketing/how-it-works/words";

import { SITE_FONTS } from "@/components/feature-pages/reach/site-fonts";
import { NEW_FEATURES } from "@/content/features";
import { HOW_IT_WORKS as W } from "@/content/how-it-works";
import { linkShown } from "@/content/resources";
import type { FeatureSlug } from "@/content/types";
import { RYE_MONDAY, WORLD } from "@/content/world";
import { claimOn, featuresOff } from "@/lib/feature-switches";
import { pageSite } from "@/lib/page-site";
import { resourcesContext } from "@/lib/resources-context";
import { isPublished } from "@/lib/search-pages";
import { pageMetadata, pageTitle } from "@/lib/seo";

/**
 * /features, "How it works" (DEC-221; boards HWDesk and HWPhone2): what
 * Saroh keeps, what reaches customers, and how you ask and connect, told in
 * six ownership chapters; how money moves; everything that stays yours;
 * and every feature in one list. A chapter, a drawing, a line or a link of a
 * switched-off feature or an unlive claim is not drawn (DEC-221 decision 1).
 * Static: the trade switch shows drawings already in the HTML.
 */
export const metadata: Metadata = pageMetadata({
    title: pageTitle(W.seoTitle),
    description: W.seoDescription,
    path: W.href,
});

export default function HowItWorksPage() {
    const off = featuresOff();
    const ctx = resourcesContext();
    const dayPage = WORLD.lead.tradePage;
    return (
        <HowItWorks
            words={W}
            world={WORLD}
            story={RYE_MONDAY}
            site={pageSite()}
            isOn={(g: Gate) =>
                (!g.release || !off.includes(g.release)) &&
                (!g.claim || claimOn(g.claim))
            }
            pageShown={(href) => linkShown(href, ctx)}
            isNew={(slug) => NEW_FEATURES.includes(slug as FeatureSlug)}
            dayOn={dayPage ? isPublished(dayPage) : false}
            className={SITE_FONTS}
        />
    );
}
