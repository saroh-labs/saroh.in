import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ComponentProps } from "react";

import { Arrow } from "@/components/v2/arrow";
import { HelpStep } from "@/components/v2/help/help-step";
import { HelpVote } from "@/components/v2/help/help-vote";
import { JsonLd } from "@/components/v2/json-ld";
import { Breadcrumbs } from "@/components/v2/resources/breadcrumbs";
import { OnThisPage } from "@/components/v2/resources/on-this-page";
import { ResourceShell } from "@/components/v2/resources/resource-shell";
import { SideNav } from "@/components/v2/resources/side-nav";
import type { HelpFrontmatter } from "@/content/help";
import {
    areasWithArticles,
    HELP_PATH,
    helpDate,
    helpHref,
    liveArticles,
    stepId,
    summarise,
} from "@/content/help";
import type { PublishContext } from "@/content/resources";
import { isLive } from "@/content/resources";
import { CAPTURED } from "@/content/shots.captured";
import { helpArticles, loadHelpArticle } from "@/lib/help-docs";
import { helpLive } from "@/lib/help-live";
import { resourcesContext } from "@/lib/resources-context";
import { pageMetadata, SITE_URL } from "@/lib/seo";
import { howToLd } from "@/lib/structured-data";

/**
 * One Help article (Resources plan U5, design 2a): the product areas down
 * the side (a Topics menu under 900px), the breadcrumb, title, intro, read
 * time and the day it was last updated, then each step with its real
 * screen, then Next. "On this page" lists the steps from 1100px.
 *
 * Every article is built at build time; one whose `publishOn` day hasn't
 * begun in India, or any while Help itself isn't live, is a 404 and is
 * linked nowhere (KTD-2). Any other slug is a 404.
 */
export const dynamicParams = false;

export function generateStaticParams() {
    return helpArticles().map((a) => ({ slug: a.slug }));
}

interface Props {
    params: Promise<{ slug: string }>;
}

function liveArticle(
    slug: string,
    ctx: PublishContext,
): HelpFrontmatter | null {
    if (!helpLive(ctx)) return null;
    const article = helpArticles().find((a) => a.slug === slug);
    return article && isLive(article, ctx) ? article : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params;
    const article = liveArticle(slug, resourcesContext());
    if (!article) return {};
    const meta = pageMetadata({
        title: `${article.title} · Saroh help`,
        socialTitle: article.title,
        description: article.description,
        path: helpHref(slug),
    });
    return {
        ...meta,
        openGraph: {
            ...meta.openGraph,
            type: "article",
            modifiedTime: `${article.updated}T00:00:00+05:30`,
        },
    };
}

const NEXT_LINK =
    "w-fit cursor-pointer rounded-sm text-mk-faq font-semibold text-brand-700 no-underline underline-offset-[3px] transition-colors duration-fast ease-out hover:underline active:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid]";

const PROSE_LINK =
    "rounded-sm font-semibold text-brand-700 underline underline-offset-[3px] transition-colors duration-fast ease-out hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid]";

export default async function HelpArticlePage({ params }: Props) {
    const { slug } = await params;
    const ctx = resourcesContext();
    if (!liveArticle(slug, ctx)) notFound();
    const doc = await loadHelpArticle(slug);
    if (!doc) notFound();
    const { frontmatter: fm, Body } = doc;

    const live = liveArticles(helpArticles().map(summarise), ctx);
    const areas = areasWithArticles(live).map(({ area, articles }) => ({
        title: area,
        items: articles.map((a) => ({ name: a.title, href: helpHref(a.slug) })),
    }));
    const next = fm.next
        .map((s) => live.find((a) => a.slug === s))
        .filter((a): a is (typeof live)[number] => !!a);
    const headings = fm.steps.map((s, i) => ({ id: stepId(i), text: s.title }));
    const path = helpHref(fm.slug);

    return (
        <ResourceShell
            className="pt-14"
            side={<SideNav label="Help topics" groups={areas} />}
            aside={<OnThisPage headings={headings} />}
        >
            <article className="grid max-w-[680px] gap-7">
                <JsonLd
                    data={howToLd({
                        name: fm.title,
                        description: fm.description,
                        url: `${SITE_URL}${path}`,
                        totalMinutes: fm.readMinutes,
                        steps: fm.steps.map((s, i) => ({
                            name: s.title,
                            text: s.body,
                            url: `${SITE_URL}${path}#${stepId(i)}`,
                            image: `${SITE_URL}${CAPTURED[s.shot].src}`,
                        })),
                    })}
                />
                <Breadcrumbs
                    crumbs={[
                        { name: "Help", href: HELP_PATH },
                        { name: fm.area },
                    ]}
                />
                <h1 className="m-0 font-display text-[clamp(36px,6vw,48px)] font-bold leading-[1.02] tracking-[-0.04em] [text-wrap:balance]">
                    {fm.title}
                </h1>
                <p className="m-0 text-mk-lead text-mk-copy [text-wrap:pretty]">
                    {fm.intro}
                </p>
                <div className="flex flex-wrap gap-x-5 gap-y-1 border-b border-border pb-1.5 text-mk-note text-muted-foreground">
                    <span>{fm.readMinutes} min read</span>
                    <span>
                        Updated{" "}
                        <time dateTime={fm.updated}>
                            {helpDate(fm.updated)}
                        </time>
                    </span>
                </div>
                {Body ? (
                    <div className="grid gap-4">
                        <Body
                            components={{
                                p: (props) => (
                                    <p
                                        className="m-0 text-[17px] leading-[1.7] text-mk-prose [text-wrap:pretty]"
                                        {...props}
                                    />
                                ),
                                // A link in the prose: another page of the
                                // site, such as an integration's own.
                                a: ({
                                    href,
                                    children,
                                }: ComponentProps<"a">) => (
                                    <Link
                                        href={href ?? ""}
                                        className={PROSE_LINK}
                                    >
                                        {children}
                                    </Link>
                                ),
                            }}
                        />
                    </div>
                ) : null}
                {fm.steps.map((step, i) => (
                    <HelpStep key={stepId(i)} step={step} index={i} />
                ))}
                <HelpVote slug={fm.slug} />
                {next.length > 0 ? (
                    <nav aria-labelledby="next" className="grid gap-2.5">
                        <h2
                            id="next"
                            className="m-0 font-display text-mk-card-lg font-bold"
                        >
                            Next
                        </h2>
                        {next.map((a) => (
                            <Link
                                key={a.slug}
                                href={helpHref(a.slug)}
                                className={NEXT_LINK}
                            >
                                {a.title}
                                <Arrow />
                            </Link>
                        ))}
                    </nav>
                ) : null}
            </article>
        </ResourceShell>
    );
}
