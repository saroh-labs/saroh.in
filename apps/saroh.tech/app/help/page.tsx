import { ContactCard } from "@/components/legal/contact-card";
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
import { SwipeRow } from "@saroh/marketing/kit/swipe-row";
import { PageHero } from "@saroh/marketing/page-hero";

const page = pageOf("/help");

export const metadata = pageMetadata(page);

export default function Page() {
    return (
        <div
            data-page-type={page.type}
            className="mx-auto flex max-w-mk-page flex-col gap-12 px-mk-gutter min-[760px]:gap-[72px]"
        >
            <JsonLd data={[...pageSchema(page), faqSchema(HELP_FAQS)]} />
            <PageHero
                crumbs={page.crumb?.map((c) => ({
                    name: c.name,
                    href: c.path,
                }))}
                title={page.h1}
                lead={page.description}
                className="px-0 pb-0 min-[760px]:pb-0"
            />

            {HELP_GROUPS.map((group) => (
                <section key={group} className="flex flex-col gap-6">
                    <h2 className="m-0 font-display text-mk-kit-h2 font-bold [text-wrap:balance]">
                        {group}
                    </h2>
                    <SwipeRow label={group}>
                        {HELP.filter((a) => a.group === group).map((a) => (
                            <LinkCard
                                key={a.slug}
                                href={`/help/${a.slug}`}
                                title={a.task}
                                line={a.line}
                                className="h-full"
                            />
                        ))}
                    </SwipeRow>
                </section>
            ))}

            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-14">
                <section className="flex flex-col">
                    <h2 className={`${H2} mb-4`}>Questions</h2>
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
