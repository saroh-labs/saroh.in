import { Breadcrumb } from "@/components/shared/breadcrumb";
import { Card, LinkCard } from "@/components/shared/card";
import { CtaBand } from "@/components/shared/cta-band";
import { JsonLd } from "@/components/shared/json-ld";
import { pageSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { ALTERNATIVES, pageOf } from "@/lib/site-map";
import { signupHref } from "@/site.config";

const page = pageOf("/compare");

export const metadata = pageMetadata(page);

const RULES = [
    "These pages say what Saroh does today, and what it doesn't.",
    "A fact about another tool goes here only with a link to its own public page and the date we checked. None has been checked yet, so none is stated.",
    "No made-up quotes or ratings, and none of their logos.",
];

export default function Page() {
    return (
        <div
            data-page-type={page.type}
            className="mx-auto flex max-w-mk-page flex-col gap-9 px-mk-gutter pt-4 md:gap-[52px] md:pt-10"
        >
            <JsonLd data={pageSchema(page)} />
            <div className="flex max-w-[860px] flex-col gap-4">
                {page.crumb ? <Breadcrumb crumbs={page.crumb} /> : null}
                <h1 className="m-0 font-display text-[38px] font-bold leading-[0.98] tracking-[-0.05em] md:text-[72px]">
                    {page.h1}
                </h1>
                <p className="m-0 text-[17px] leading-[1.55] text-body md:text-[19px]">
                    What Saroh does today and what it doesn&apos;t, to set
                    beside the invoice app you use now.
                </p>
            </div>

            <section className="flex flex-col gap-[18px]">
                <h2 className="m-0 font-display text-[28px] font-bold tracking-[-0.035em]">
                    Saroh and other tools
                </h2>
                <div className="grid gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-3">
                    {ALTERNATIVES.map(([slug, name]) => (
                        <LinkCard
                            key={slug}
                            href={`/compare/${slug}-alternative`}
                            title={`${name} alternative`}
                            line={`What Saroh does today, to set beside ${name}.`}
                        />
                    ))}
                </div>
            </section>

            <Card className="max-w-[860px]">
                <h2 className="m-0 font-display text-[22px] font-bold tracking-[-0.03em]">
                    How we compare
                </h2>
                <ul className="m-0 flex list-disc flex-col gap-1.5 pl-[22px] text-[17px] leading-[1.55] text-body">
                    {RULES.map((r) => (
                        <li key={r}>{r}</li>
                    ))}
                </ul>
            </Card>

            <CtaBand
                title="Try it with your next invoice."
                line="Free plan, no card. Import your customers by CSV."
                action="Start free"
                href={signupHref("compare")}
                from="start-free-band"
            />
        </div>
    );
}
