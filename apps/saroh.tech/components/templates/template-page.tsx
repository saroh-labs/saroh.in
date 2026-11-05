import { Breadcrumb } from "@/components/shared/breadcrumb";
import { CtaBand } from "@/components/shared/cta-band";
import { FaqList } from "@/components/shared/faq-list";
import { JsonLd } from "@/components/shared/json-ld";
import { RelatedGrid } from "@/components/shared/related-grid";
import { StepList } from "@/components/shared/step-list";
import { faqSchema, howToSchema, pageSchema } from "@/lib/schema";
import type { SitePage } from "@/lib/site-map";
import type { TemplatePage as Data } from "@/lib/templates/pages";
import { relatedOf, similarOf, toolOf } from "@/lib/templates/pages";
import { signupHref } from "@/site.config";

import {
    ChipLink,
    CountryFacts,
    DownloadRow,
    ExampleItems,
    H2,
    PaymentTerms,
    PreviewImage,
    TemplateHero,
    TipsList,
} from "./blocks";

const howTo = (data: Data) => {
    const doc = data.document.name.toLowerCase();
    return [
        {
            title: "Open it",
            text: `Fill it online in the ${toolOf(data.document.slug).toolName}, or download the file.`,
        },
        {
            title: "Change the example",
            text: "Replace the example lines and amounts with your own work and your own prices.",
        },
        {
            title: "Add the names",
            text: "Put in your details, your client's details and the dates.",
        },
        {
            title: "Send it",
            text: `Save the ${doc} as a PDF, send it to your client and keep a copy.`,
        },
    ];
};

/** One template, every document, trade and country page. */
export function TemplatePage({ page, data }: { page: SitePage; data: Data }) {
    const steps = howTo(data);
    const audience = data.trade?.plural;
    const similar = similarOf(data);
    const doc = data.document.name;
    return (
        <div
            data-page-type={page.type}
            className="mx-auto flex max-w-mk-page flex-col gap-10 px-mk-gutter pt-4 md:gap-16 md:pt-8"
        >
            <JsonLd
                data={[
                    ...pageSchema(page),
                    howToSchema(
                        `How to fill in this ${doc.toLowerCase()}`,
                        steps,
                    ),
                    faqSchema(data.faqs),
                ]}
            />

            <section className="grid items-start gap-6 lg:grid-cols-[560px_minmax(0,1fr)] lg:gap-16">
                <div className="flex min-w-0 flex-col gap-5 lg:order-2 lg:pt-2">
                    {page.crumb ? <Breadcrumb crumbs={page.crumb} /> : null}
                    <TemplateHero page={data} />
                    <DownloadRow page={data} />
                    <span className="text-[13px] text-muted-foreground">
                        No sign-up, no watermark. Example prices are
                        placeholders, not advice on what to charge.
                    </span>
                </div>
                <div className="min-w-0 lg:order-1">
                    <PreviewImage page={data} />
                </div>
            </section>

            <section className="grid gap-10 lg:grid-cols-2 lg:gap-16">
                <ExampleItems items={data.items} fields={data.fields} />
                <PaymentTerms
                    title={
                        audience
                            ? `How ${audience} get paid`
                            : data.country
                              ? `Getting paid in ${data.country.place}`
                              : "How payment works"
                    }
                    text={data.payment.text}
                    points={data.payment.points}
                />
            </section>

            {data.country ? (
                <CountryFacts name={data.country.place} facts={data.facts} />
            ) : null}

            <TipsList tips={data.tips} />

            <section className="flex flex-col gap-3 md:gap-[18px]">
                <h2 className={H2}>How to fill it</h2>
                <StepList steps={steps} />
            </section>

            <section className="grid gap-4 lg:grid-cols-[420px_minmax(0,1fr)] lg:gap-14">
                <h2 className={H2}>
                    {audience
                        ? `Questions ${audience} ask`
                        : data.country
                          ? `Questions about ${data.country.name} ${doc.toLowerCase()}s`
                          : `Questions about ${doc.toLowerCase()}s`}
                </h2>
                <FaqList items={data.faqs} />
            </section>

            <RelatedGrid
                title={
                    audience
                        ? `More for ${audience}`
                        : data.country
                          ? `More for ${data.country.place}`
                          : "More templates"
                }
                items={relatedOf(data).map((r) => ({
                    title: r.title,
                    line: r.line,
                    href: r.href,
                }))}
            />

            {similar.length ? (
                <section className="flex flex-col gap-3.5">
                    <h2 className="m-0 font-display text-mk-h2-xs font-bold [text-wrap:balance]">
                        {data.country
                            ? `${doc} templates for other countries`
                            : data.trade
                              ? `${doc} templates for similar work`
                              : `${doc} templates by trade and country`}
                    </h2>
                    <div className="flex flex-wrap gap-2">
                        {similar.map((s) => (
                            <ChipLink key={s.href} href={s.href}>
                                {s.name}
                            </ChipLink>
                        ))}
                    </div>
                </section>
            ) : null}

            <CtaBand
                title={data.band.title}
                line={data.band.line}
                action="Start free"
                href={signupHref("template", { template: data.key })}
                from="start-free-band"
            />
        </div>
    );
}
