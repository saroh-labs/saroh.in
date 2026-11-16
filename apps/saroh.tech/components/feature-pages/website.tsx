import { WebsiteView } from "@saroh/marketing/feature-pages/website-page";

import { features } from "@/content/features";
import { websiteWords } from "@/content/reach-website";
import { WORLD } from "@/content/world";
import { featuresOff } from "@/lib/feature-switches";
import { pageSite } from "@/lib/page-site";

import { inTheAppData, REACH_CRUMB } from "./data";
import { SITE_FONTS } from "./site-fonts";

/** /features/website: saroh.in's Reach page with Global's words and world. */
export function WebsitePage() {
    const site = pageSite();
    const templates = !featuresOff().includes("templates");
    return Promise.resolve(
        <WebsiteView
            site={site}
            words={websiteWords({
                shop: site.claimOn("site-shop"),
                templates,
            })}
            world={WORLD}
            crumb={REACH_CRUMB}
            inTheApp={inTheAppData("website")}
            fonts={SITE_FONTS}
            templates={templates ? features.website.templates : null}
            // No gallery of website templates here: /templates is the documents gallery.
            templatesHref={null}
        />,
    );
}
