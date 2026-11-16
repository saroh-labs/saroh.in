import type { ClaimSwitch } from "@saroh/marketing/feature-switches";
import { HowItWorksPage } from "@saroh/marketing/how-it-works/how-it-works-page";
import type { Gate } from "@saroh/marketing/how-it-works/words";

import { SITE_FONTS } from "@/components/feature-pages/site-fonts";
import { JsonLd } from "@/components/shared/json-ld";
import { HOW_IT_WORKS } from "@/content/how-it-works";
import { THISTLEWICK_TUESDAY, WORLD } from "@/content/world";
import { claimsOff, featuresOff } from "@/lib/feature-switches";
import { pageSite } from "@/lib/page-site";
import { pageSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { pageAt, pageOf } from "@/lib/site-map";

const page = pageOf("/features");

export const metadata = pageMetadata(page);

/**
 * /features, "How it works" (DEC-221; HWDesk and HWPhone2), saroh.in's page
 * in Global's words and world: the six ownership chapters, how money moves
 * (through the business's own Stripe), everything that stays yours and the
 * full feature index. A chapter, drawing, line or link of a switched-off
 * feature or an unlive claim is not drawn. Global has no written day yet,
 * so the "follow one day" line isn't drawn.
 */
export default function Page() {
    const off = featuresOff();
    const claims = claimsOff();
    const claimOn = (c: ClaimSwitch) => !claims.includes(c);
    return (
        <div data-page-type={page.type}>
            <JsonLd data={pageSchema(page)} />
            <HowItWorksPage
                words={HOW_IT_WORKS}
                world={WORLD}
                story={THISTLEWICK_TUESDAY}
                site={pageSite()}
                isOn={(g: Gate) =>
                    (!g.release || !off.includes(g.release)) &&
                    (!g.claim || claimOn(g.claim))
                }
                pageShown={(href) => Boolean(pageAt(href.split("#")[0]))}
                isNew={() => false}
                dayOn={false}
                className={SITE_FONTS}
            />
        </div>
    );
}
