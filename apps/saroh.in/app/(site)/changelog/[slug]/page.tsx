import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/resources/breadcrumbs";
import { JsonLd } from "@/components/shared/layout/json-ld";
import { Arrow } from "@/components/shared/links/arrow";
import { textLinkClasses } from "@/components/shared/links/text-link";
import {
    CHANGELOG_ENTRIES,
    changelogHref,
    entryDate,
} from "@/content/changelog";
import { linkShown, liveBySlug } from "@/content/resources";
import { resourcesContext } from "@/lib/resources-context";
import { pageMetadata, pageTitle } from "@/lib/seo";
import { articleLd, breadcrumbLd } from "@/lib/structured-data";

/**
 * One changelog entry (plan U4, design "Saroh is open"). Every entry is
 * built at build time, but one whose `publishOn` day hasn't begun in India
 * is a 404 and is linked nowhere (KTD-2); the first deploy on or after its
 * day brings it in (`app/layout.tsx`). Any other slug is a 404.
 */
export const dynamicParams = false;

export function generateStaticParams() {
    return CHANGELOG_ENTRIES.map((e) => ({ slug: e.slug }));
}

interface Props {
    params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params;
    const entry = liveBySlug(CHANGELOG_ENTRIES, slug, resourcesContext());
    if (!entry) return {};
    const meta = pageMetadata({
        title: pageTitle(`${entry.title} · Changelog`),
        socialTitle: entry.title,
        description: entry.description,
        path: changelogHref(slug),
    });
    return {
        ...meta,
        openGraph: {
            ...meta.openGraph,
            type: "article",
            publishedTime: `${entry.publishOn}T00:00:00+05:30`,
        },
    };
}

export default async function ChangelogEntryPage({ params }: Props) {
    const { slug } = await params;
    const ctx = resourcesContext();
    const entry = liveBySlug(CHANGELOG_ENTRIES, slug, ctx);
    if (!entry) notFound();
    const path = changelogHref(entry.slug);

    return (
        <article className="mx-auto grid w-full max-w-[720px] gap-6 px-6 pt-[72px]">
            <JsonLd
                data={[
                    articleLd({
                        headline: entry.title,
                        description: entry.description,
                        path,
                        publishOn: entry.publishOn,
                    }),
                    // The trail drawn below, ending on this entry.
                    breadcrumbLd([
                        { name: "Changelog", path: "/changelog" },
                        { name: entry.title, path },
                    ]),
                ]}
            />
            <Breadcrumbs
                mono
                crumbs={[
                    { name: "Changelog", href: "/changelog" },
                    {
                        name: (
                            <time dateTime={entry.publishOn}>
                                {entryDate(entry.publishOn)}
                            </time>
                        ),
                    },
                ]}
            />
            <h1 className="m-0 font-display text-[clamp(36px,6vw,56px)] font-bold leading-none tracking-[-0.045em]">
                {entry.title}
            </h1>
            <p className="m-0 text-mk-lead leading-[1.65] text-mk-prose [text-wrap:pretty]">
                {entry.lead}
            </p>
            {entry.sections.map((section) => (
                <section
                    key={section.name}
                    className="grid gap-1.5 border-t border-border pt-[18px]"
                >
                    <h2 className="m-0 font-display text-mk-card-lg font-bold">
                        {section.name}
                    </h2>
                    <p className="m-0 text-mk-body leading-[1.7] text-mk-prose">
                        {section.body}
                    </p>
                    {section.link && linkShown(section.link.href, ctx) ? (
                        <Link
                            href={section.link.href}
                            className={textLinkClasses({
                                className: "w-fit text-[14.5px] font-semibold",
                            })}
                        >
                            {section.link.label}
                            <Arrow />
                        </Link>
                    ) : null}
                </section>
            ))}
            <p className="m-0 text-[15px] text-muted-foreground">
                {entry.signoff}
            </p>
        </article>
    );
}
