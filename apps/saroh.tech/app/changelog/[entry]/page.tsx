import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EntryBody, EntryMeta } from "@/components/content/changelog-entry";
import { Breadcrumb } from "@/components/shared/breadcrumb";
import { CtaBand } from "@/components/shared/cta-band";
import { JsonLd } from "@/components/shared/json-ld";
import { CHANGELOG, changelogPath } from "@/content/changelog";
import { articleSchema, pageSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { pageOf } from "@/lib/site-map";
import { signupHref } from "@/site.config";

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
            className="mx-auto max-w-[1440px] px-4 pt-4 md:px-20 md:pt-10"
        >
            <JsonLd data={[articleSchema(page), ...pageSchema(page)]} />
            <div className="flex max-w-[860px] flex-col gap-4">
                {page.crumb ? <Breadcrumb crumbs={page.crumb} /> : null}
                <div className="flex items-center gap-2.5">
                    <EntryMeta entry={entry} />
                </div>
                <h1 className="m-0 font-display text-[34px] font-bold leading-none tracking-[-0.045em] md:text-[56px]">
                    {page.h1}
                </h1>
                <EntryBody entry={entry} />
            </div>
            <div className="pt-10 md:pt-16">
                <CtaBand
                    title="We ship every week."
                    line="Try what's new on the free plan."
                    action="Start free"
                    href={signupHref("changelog")}
                    from="start-free-band"
                />
            </div>
        </div>
    );
}
