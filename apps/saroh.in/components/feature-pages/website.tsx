import { WebsiteView } from "@saroh/marketing/feature-pages/website-page";

import { features } from "@/content/features";
import { websiteWords } from "@/content/reach-website";
import { WORLD } from "@/content/world";
import { claimOn } from "@/lib/feature-switches";
import { LAUNCH_MODE } from "@/lib/links";
import { pageSite } from "@/lib/page-site";
import { resourcesContext } from "@/lib/resources-context";

import { featureName, inTheAppData, REACH_CRUMB } from "./reach/data";
import { SITE_FONTS } from "./reach/site-fonts";

/** /features/website (FWDesk, FWPhone2): the shared page with saroh.in's words and world. */
export function WebsitePage() {
    const templates = !resourcesContext().off?.includes("templates");
    return Promise.resolve(
        <WebsiteView
            site={pageSite()}
            words={websiteWords({
                shop: claimOn("site-shop"),
                open: LAUNCH_MODE === "open",
                templates,
            })}
            world={WORLD}
            crumb={REACH_CRUMB}
            featureName={featureName}
            inTheApp={inTheAppData("website")}
            fonts={SITE_FONTS}
            templates={templates ? features.website.templates : null}
        />,
    );
}
