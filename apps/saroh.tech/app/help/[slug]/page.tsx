import { PageTitle } from "@saroh/marketing/page-title";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ContactCard } from "@/components/legal/contact-card";
import { Breadcrumb } from "@/components/shared/breadcrumb";
import { ButtonLink } from "@/components/shared/button";
import { Card } from "@/components/shared/card";
import { JsonLd } from "@/components/shared/json-ld";
import { Marked } from "@/components/shared/marked";
import { RelatedGrid } from "@/components/shared/related-grid";
import { StepList } from "@/components/shared/step-list";
import { HELP, helpArticle } from "@/content/help";
import { placeholders } from "@/content/placeholders";
import { howToSchema, pageSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { pageOf } from "@/lib/site-map";

export const dynamicParams = false;

export const generateStaticParams = () => HELP.map(({ slug }) => ({ slug }));

interface Props {
    params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    return pageMetadata(pageOf(`/help/${(await params).slug}`));
}

export default async function Page({ params }: Props) {
    const { slug } = await params;
    const article = helpArticle(slug);
    if (!article) notFound();
    const page = pageOf(`/help/${slug}`);
    const { task, minutes, intro, steps, note, next, related } = article;
    return (
        <div
            data-page-type={page.type}
            className="mx-auto flex max-w-mk-page flex-col gap-6 px-mk-gutter pt-6 md:gap-10 md:pt-7"
        >
            <JsonLd data={[...pageSchema(page), howToSchema(task, steps)]} />
            <div className="flex flex-col gap-4">
                {page.crumb ? <Breadcrumb crumbs={page.crumb} /> : null}
                <PageTitle size="article">{page.h1}</PageTitle>
                <p className="m-0 max-w-[66ch] text-lg leading-normal text-mk-copy md:text-[19px]">
                    {intro}
                </p>
                <p className="m-0 text-[15px] text-muted-foreground">
                    Takes about {minutes} {minutes === 1 ? "minute" : "minutes"}
                </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,720px)_360px] lg:justify-between">
                <div className="flex flex-col gap-4">
                    <StepList steps={steps} className="" />
                    {note ? (
                        <p className="m-0 text-[15px] leading-normal text-mk-copy">
                            {note}
                        </p>
                    ) : null}
                </div>
                <aside className="flex flex-col gap-3 lg:sticky lg:top-[calc(var(--mk-nav-h)+16px)] lg:self-start">
                    <Card>
                        <h2 className="m-0 font-display text-mk-card font-bold [text-wrap:balance]">
                            Ready?
                        </h2>
                        <ButtonLink href={next.href} data-cta="help-next-step">
                            {next.label}
                        </ButtonLink>
                        {next.inApp ? (
                            <p className="m-0 text-[13px] leading-normal text-mk-copy">
                                <Marked text={placeholders.helpDeepLinks} />
                            </p>
                        ) : null}
                    </Card>
                    <ContactCard />
                </aside>
            </div>

            <div className="pt-4">
                <RelatedGrid
                    title="Related"
                    items={related.map((r) => {
                        const a = helpArticle(r);
                        if (!a) throw new Error(`No help article called ${r}`);
                        return {
                            title: a.task,
                            line: a.line,
                            href: `/help/${r}`,
                        };
                    })}
                />
            </div>
        </div>
    );
}
