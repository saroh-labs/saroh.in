import { Container } from "@saroh/marketing/container";
import { PageTitle } from "@saroh/marketing/page-title";

import { ReportForm } from "@/components/customers/report-form";
import { CUSTOMERS } from "@/content/customers";
import { pageMetadata } from "@/lib/seo";
import { pageOf } from "@/lib/site-map";
import { site } from "@/site.config";

const page = pageOf("/customers");

export const metadata = pageMetadata(page);

/** For customers of a business on Saroh, in the legal pages' reading column. */
export default function CustomersPage() {
    return (
        <Container
            as="article"
            width="article"
            data-page-type={page.type}
            className="grid gap-5 pt-[72px]"
        >
            <PageTitle size="article">{page.h1}</PageTitle>
            <div className="grid gap-3.5 text-mk-body text-mk-copy">
                <p className="m-0 leading-[1.7] [text-wrap:pretty]">
                    {CUSTOMERS.intro}
                </p>
                {CUSTOMERS.sections.map((section) => (
                    <section key={section.title} className="contents">
                        <h2 className="m-0 mt-6 border-t border-border pt-6 font-display text-mk-card-lg font-bold text-foreground">
                            {section.title}
                        </h2>
                        <p className="m-0 leading-[1.7] [text-wrap:pretty]">
                            {section.text}
                        </p>
                    </section>
                ))}
            </div>
            <div className="pb-10 pt-2">
                {/* Always Global's address: the API files the report under the edition of the address it came through. */}
                <ReportForm apiUrl={site.apiUrl} />
            </div>
        </Container>
    );
}
