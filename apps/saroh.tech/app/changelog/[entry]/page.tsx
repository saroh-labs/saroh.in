import { PageTitle } from "@saroh/marketing/page-title";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
    ChangelogBand,
    EntryBody,
    EntryMeta,
} from "@/components/content/changelog-entry";
import { Breadcrumb } from "@/components/shared/breadcrumb";
import { JsonLd } from "@/components/shared/json-ld";
import { CHANGELOG, changelogPath } from "@/content/changelog";
import { articleSchema, pageSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { pageOf } from "@/lib/site-map";

export const dynamicParams = false;

const slugOf = (e: (typeof CHANGELOG)[number]) => `${e.date}-${e.slug}`;

export const generateStaticParams = () =>
    CHANGELOG.map((e) => ({ entry: slugOf(e) }));

interface Props {
    params: Promise<{ entry: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    return pageMetadata(pageOf(`/changelog/${(await params).entry}`));
}

export default async function Page({ params }: Props) {
    const { entry: param } = await params;
    const entry = CHANGELOG.find((e) => slugOf(e) === param);
    if (!entry) notFound();
    const page = pageOf(changelogPath(entry));
    return (
        <div
            data-page-type={page.type}
            className="mx-auto max-w-mk-page px-mk-gutter pt-4 md:pt-10"
        >
            <JsonLd data={[articleSchema(page), ...pageSchema(page)]} />
            <div className="flex max-w-[860px] flex-col gap-4">
                {page.crumb ? <Breadcrumb crumbs={page.crumb} /> : null}
                <div className="flex items-center gap-2.5">
                    <EntryMeta entry={entry} />
                </div>
                <PageTitle size="article">{page.h1}</PageTitle>
                <EntryBody entry={entry} />
                {entry.sections?.map((s) => (
                    <section
                        key={s.name}
                        className="flex flex-col gap-1.5 pt-2"
                    >
                        <h2 className="m-0 font-display text-mk-h2-xs font-bold [text-wrap:balance]">
                            {s.name}
                        </h2>
                        <p className="m-0 text-[17px] leading-[1.6] text-mk-copy">
                            {s.body}
                        </p>
                    </section>
                ))}
            </div>
            <ChangelogBand />
        </div>
    );
}
