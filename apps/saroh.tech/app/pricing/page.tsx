import { ButtonLink } from "@saroh/marketing/button";
import { Container } from "@saroh/marketing/container";
import { CtaBand } from "@saroh/marketing/cta-band";
import { PricingHero } from "@saroh/marketing/pricing-hero";
import { UsageTable } from "@saroh/marketing/usage-table";

import { Plans } from "@/components/pricing/plans";
import { JsonLd } from "@/components/shared/json-ld";
import { CTA_BAND } from "@/content/home";
import { PRICING } from "@/content/pricing";
import {
    freeCardModel,
    freeUsage,
    pricingModel,
    readCatalog,
} from "@/lib/plans";
import { pageSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { pageOf } from "@/lib/site-map";
import { signupHref } from "@/site.config";

const page = pageOf("/pricing");

export const metadata = pageMetadata(page);

/** saroh.in's pricing page, with one table: only Free's limits are read. */
export default async function PricingPage() {
    const catalog = await readCatalog();
    return (
        <div data-page-type={page.type}>
            <JsonLd data={pageSchema(page)} />
            <PricingHero
                eyebrow={PRICING.eyebrow}
                title={page.h1}
                intro={PRICING.intro}
            />
            <Container
                as="section"
                aria-labelledby="plans-title"
                className="grid gap-3.5 pt-14"
            >
                <h2 id="plans-title" className="sr-only">
                    Plans
                </h2>
                <Plans model={pricingModel(catalog)} />
            </Container>
            <UsageTable
                plans={freeCardModel(catalog).views["month-excl"].plans}
                usage={freeUsage(catalog)}
                title={PRICING.usageTitle}
                lead={PRICING.usageLead}
            />
            <CtaBand
                title={PRICING.closer}
                body={CTA_BAND.body}
                note={CTA_BAND.note}
                className="pt-[120px]"
                actions={
                    <ButtonLink
                        variant="saffron"
                        href={signupHref("pricing")}
                        data-cta="start-free-band"
                    >
                        Start free
                    </ButtonLink>
                }
            />
        </div>
    );
}
