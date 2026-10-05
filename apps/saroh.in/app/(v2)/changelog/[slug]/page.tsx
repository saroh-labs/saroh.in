import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Arrow } from "@/components/v2/arrow";
import { JsonLd } from "@/components/v2/json-ld";
import { Breadcrumbs } from "@/components/v2/resources/breadcrumbs";
import type { ChangelogEntry } from "@/content/changelog";
import {
    CHANGELOG_ENTRIES,
    changelogHref,
    entryDate,
    findEntry,
} from "@/content/changelog";
import type { PublishContext } from "@/content/resources";
import { isLive, linkShown } from "@/content/resources";
import { launchOfferLines } from "@/content/waitlist";
import { readLaunchOffer } from "@/lib/launch-offer";
import { resourcesContext } from "@/lib/resources-context";
import { pageMetadata } from "@/lib/seo";
import { articleLd } from "@/lib/structured-data";

/**
 * One changelog entry (plan U4, design "Saroh is open"). Every entry is
 * built at build time, but one whose `publishOn` day hasn't begun in India
 * is a 404 and is linked nowhere (KTD-2); the root layout's five-minute
 * revalidate brings it in on its day. Any other slug is a 404.
 */
export const dynamicParams = false;

export function generateStaticParams() {
    return CHANGELOG_ENTRIES.map((e) => ({ slug: e.slug }));
}

interface Props {
    params: Promise<{ slug: string }>;
}

/** The entry at `slug`, only when it is live. */
function liveEntry(slug: string, ctx: PublishContext): ChangelogEntry | null {
    const entry = findEntry(slug);
    return entry && isLive(entry, ctx) ? entry : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params;
    const entry = liveEntry(slug, resourcesContext());
    if (!entry) return {};
    const meta = pageMetadata({
        title: `${entry.title} · Saroh changelog`,
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
    const entry = liveEntry(slug, ctx);
    if (!entry) notFound();
    const offer = await readLaunchOffer();
    const path = changelogHref(entry.slug);

    return (
        <article className="mx-auto grid w-full max-w-[720px] gap-6 px-6 pt-[72px]">
            <JsonLd
                data={articleLd({
                    headline: entry.title,
                    description: entry.description,
                    path,
                    publishOn: entry.publishOn,
                })}
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
                            className="w-fit cursor-pointer rounded-sm text-[14.5px] font-semibold text-brand-700 underline-offset-[3px] hover:text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid] active:text-foreground"
                        >
                            {section.link.label}
                            <Arrow />
                        </Link>
                    ) : null}
                </section>
            ))}
            <div className="grid gap-2.5 rounded-mk-card border border-border bg-card p-6">
                <span className="text-base font-semibold">
                    On the waitlist?
                </span>
                <span className="text-mk-faq text-mk-copy">
                    {offer
                        ? `Your invite is in your email, with ${launchOfferLines(offer).headline}.`
                        : "Your invite is in your email."}
                </span>
            </div>
            <p className="m-0 text-[15px] text-muted-foreground">
                {entry.signoff}
            </p>
        </article>
    );
}
