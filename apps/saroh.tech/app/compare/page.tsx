import { Card, LinkCard } from "@/components/shared/card";
import { CtaBand } from "@/components/shared/cta-band";
import { HubHead } from "@/components/shared/hub-head";
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
            <HubHead page={page}>
                What Saroh does today and what it doesn&apos;t, to set beside
                the invoice app you use now.
            </HubHead>

            <section className="flex flex-col gap-[18px]">
                <h2 className="m-0 font-display text-mk-h2-xs font-bold [text-wrap:balance]">
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
                <h2 className="m-0 font-display text-mk-card-lg font-bold [text-wrap:balance]">
                    How we compare
                </h2>
                <ul className="m-0 flex list-disc flex-col gap-1.5 pl-[22px] text-[17px] leading-[1.55] text-mk-copy">
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
