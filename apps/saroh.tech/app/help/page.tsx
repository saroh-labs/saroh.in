import { ContactCard } from "@/components/legal/contact-card";
import { Breadcrumb } from "@/components/shared/breadcrumb";
import { LinkCard } from "@/components/shared/card";
import { CtaBand } from "@/components/shared/cta-band";
import { FaqList } from "@/components/shared/faq-list";
import { JsonLd } from "@/components/shared/json-ld";
import { H2 } from "@/components/tools/tool-page";
import { HELP, HELP_FAQS, HELP_GROUPS } from "@/content/help";
import { faqSchema, pageSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { pageOf } from "@/lib/site-map";
import { signupHref } from "@/site.config";
import { PageTitle } from "@saroh/marketing/page-title";

const page = pageOf("/help");

export const metadata = pageMetadata(page);

export default function Page() {
    return (
        <div
            data-page-type={page.type}
            className="mx-auto flex max-w-mk-page flex-col gap-10 px-mk-gutter pt-6 md:gap-14 md:pt-7"
        >
            <JsonLd data={[...pageSchema(page), faqSchema(HELP_FAQS)]} />
            <div className="flex flex-col gap-4">
                {page.crumb ? <Breadcrumb crumbs={page.crumb} /> : null}
                <PageTitle size="page">{page.h1}</PageTitle>
                <p className="m-0 max-w-[66ch] text-lg leading-normal text-mk-copy md:text-[19px]">
                    {page.description}
                </p>
            </div>

            {HELP_GROUPS.map((group) => (
                <section key={group} className="flex flex-col gap-4">
                    <h2 className="m-0 font-display text-mk-h2-xs font-bold [text-wrap:balance]">
                        {group}
                    </h2>
                    <div className="grid gap-3 md:grid-cols-2 md:gap-6 xl:grid-cols-3">
                        {HELP.filter((a) => a.group === group).map((a) => (
                            <LinkCard
                                key={a.slug}
                                href={`/help/${a.slug}`}
                                title={a.task}
                                line={a.line}
                            />
                        ))}
                    </div>
                </section>
            ))}

            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-14">
                <section className="flex flex-col">
                    <h2 className={`${H2} mb-3`}>Questions</h2>
                    <FaqList items={HELP_FAQS} />
                </section>
                <aside className="lg:self-end">
                    <ContactCard />
                </aside>
            </div>

            <CtaBand
                title="Try it yourself."
                line="Free plan, no card."
                action="Start free"
                href={signupHref("help")}
                from="start-free-band"
            />
        </div>
    );
}
