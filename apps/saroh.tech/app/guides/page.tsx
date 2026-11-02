import { Breadcrumb } from "@/components/shared/breadcrumb";
import { ButtonLink } from "@/components/shared/button";
import { LinkCard } from "@/components/shared/card";
import { CtaBand } from "@/components/shared/cta-band";
import { JsonLd } from "@/components/shared/json-ld";
import { GUIDE_CONTENT, GUIDE_GROUPS } from "@/content/guides";
import { pageSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { pageOf } from "@/lib/site-map";
import { signupHref } from "@/site.config";

const page = pageOf("/guides");

export const metadata = pageMetadata(page);

export default function Page() {
    return (
        <div
            data-page-type={page.type}
            className="mx-auto flex max-w-[1440px] flex-col gap-9 px-4 pt-4 md:gap-[52px] md:px-20 md:pt-10"
        >
            <JsonLd data={pageSchema(page)} />
            <div className="flex max-w-[860px] flex-col gap-4">
                {page.crumb ? <Breadcrumb crumbs={page.crumb} /> : null}
                <h1 className="m-0 font-display text-[38px] font-bold leading-[0.98] tracking-[-0.05em] md:text-[72px]">
                    {page.h1}
                </h1>
                <p className="m-0 text-[17px] leading-[1.55] text-body md:text-[19px]">
                    Plain answers on writing invoices and quotes, asking for
                    payment and setting your rate. Start with how to write an
                    invoice.
                </p>
                <div>
                    <ButtonLink
                        href="/guides/how-to-write-an-invoice"
                        data-cta="guides-first"
                    >
                        How to write an invoice
                    </ButtonLink>
                </div>
            </div>

            {GUIDE_GROUPS.map((group) => (
                <section key={group} className="flex flex-col gap-[18px]">
                    <h2 className="m-0 font-display text-[28px] font-bold tracking-[-0.035em]">
                        {group}
                    </h2>
                    <div className="grid gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-4">
                        {GUIDE_CONTENT.filter((g) => g.group === group).map(
                            (g) => (
                                <LinkCard
                                    key={g.slug}
                                    href={`/guides/${g.slug}`}
                                    title={g.card.title}
                                    line={g.card.line}
                                />
                            ),
                        )}
                    </div>
                </section>
            ))}

            <CtaBand
                title="Keep it all in one place."
                line="Send quotes and invoices and get paid in Saroh. Free plan, no card."
                action="Start free"
                href={signupHref("guides")}
                from="start-free-band"
            />
        </div>
    );
}
