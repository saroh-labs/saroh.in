import { Container } from "@saroh/marketing/container";
import { PageHero } from "@saroh/marketing/page-hero";
import { Section } from "@saroh/marketing/section";

import { Plans } from "@/components/pricing/plans";
import { Closing } from "@/components/shared/closing";
import { JsonLd } from "@/components/shared/json-ld";
import { CTA_BAND } from "@/content/home";
import { PRICING } from "@/content/pricing";
import { freeUsage, pricingModel, readPricing } from "@/lib/plans";
import { pageSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { pageOf } from "@/lib/site-map";
import { signupHref } from "@/site.config";

const page = pageOf("/pricing");

export const metadata = pageMetadata(page);

/**
 * saroh.in's pricing page, with Free's limits in place of its tables. One plan
 * needs no column to compare, so the words sit in rows that fit a phone.
 */
export default async function PricingPage() {
    const read = await readPricing();
    const catalog = read?.catalog ?? null;
    const usage = freeUsage(catalog);
    return (
        <div data-page-type={page.type}>
            <JsonLd data={pageSchema(page)} />
            <PageHero
                crumbs={[{ name: PRICING.eyebrow }]}
                title={page.h1}
                mark="free."
                lead={PRICING.intro}
                className="pb-8 min-[760px]:pb-10"
            />
            <Container
                as="section"
                aria-labelledby="plans-title"
                className="grid gap-3.5"
            >
                <h2 id="plans-title" className="sr-only">
                    Plans
                </h2>
                <Plans model={pricingModel(catalog, read?.offered)} />
            </Container>
            {usage ? (
                <Section
                    id="usage"
                    titleId="usage-title"
                    title={PRICING.usageTitle}
                    lead={PRICING.usageLead}
                    size="kit-h2"
                    className="grid scroll-mt-6 gap-6 pt-[72px] min-[760px]:pt-[120px]"
                >
                    <dl className="m-0 rounded-mk-card border border-border bg-card px-5 text-[15px]">
                        {usage.map((row) => (
                            <div
                                key={row.label}
                                className="grid gap-1 border-b border-border py-4 last:border-b-0 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)] md:gap-6"
                            >
                                <dt className="font-semibold">{row.label}</dt>
                                <dd className="m-0 text-mk-copy">{row.at}</dd>
                            </div>
                        ))}
                    </dl>
                    <ul className="m-0 grid list-disc gap-1.5 pl-5 text-mk-note text-muted-foreground">
                        {PRICING.usageNotes.map((note) => (
                            <li key={note}>{note}</li>
                        ))}
                    </ul>
                </Section>
            ) : null}
            <Closing
                id="pricing-start"
                title={PRICING.closer}
                href={signupHref("pricing")}
                note={`${CTA_BAND.body} ${CTA_BAND.note}`}
            />
        </div>
    );
}
