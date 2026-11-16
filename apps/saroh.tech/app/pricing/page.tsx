import { Container } from "@saroh/marketing/container";
import { PageHero } from "@saroh/marketing/page-hero";

import { PricingTables } from "@/components/pricing/plans";
import { Closing } from "@/components/shared/closing";
import { JsonLd } from "@/components/shared/json-ld";
import { CTA_BAND } from "@/content/home";
import { planWords } from "@/content/plan-words";
import { PRICING } from "@/content/pricing";
import { paidPlansOn, pricingModel, readPricing } from "@/lib/plans";
import { pageSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { pageOf } from "@/lib/site-map";
import { signupHref } from "@/site.config";

const page = pageOf("/pricing");

export const metadata = pageMetadata(page);

/**
 * saroh.in's pricing page: the plan cards, the comparison table and each
 * plan's usage (the shared PricingPlans), without saroh.in's add-ons.
 */
export default async function PricingPage() {
    const read = await readPricing();
    const catalog = read?.catalog ?? null;
    const on = await paidPlansOn(read);
    const words = planWords(on);
    return (
        <div data-page-type={page.type}>
            <JsonLd data={pageSchema(page)} />
            <PageHero
                crumbs={[{ name: PRICING.eyebrow }]}
                title={words.pricingTitle}
                mark="free."
                lead={words.pricingIntro}
                className="pb-8 min-[760px]:pb-10"
            />
            {/* The cards, then every plan's details, as saroh.in (owner, 16 Nov 2026). */}
            <PricingTables model={pricingModel(catalog, on)} on={on} />
            <Container className="pt-6">
                <ul className="m-0 grid list-disc gap-1.5 pl-5 text-mk-note text-muted-foreground">
                    {[...PRICING.usageNotes, words.pricingUsage].map((note) => (
                        <li key={note}>{note}</li>
                    ))}
                </ul>
            </Container>
            <Closing
                id="pricing-start"
                title={PRICING.closer}
                href={signupHref("pricing")}
                note={`${CTA_BAND.body} ${CTA_BAND.note}`}
            />
        </div>
    );
}
