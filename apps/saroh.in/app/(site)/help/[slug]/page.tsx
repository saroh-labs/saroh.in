import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ComponentProps } from "react";

import { HelpStep } from "@/components/help/help-step";
import { HelpVote } from "@/components/help/help-vote";
import { OnThisPage } from "@/components/resources/on-this-page";
import { ResourceShell } from "@/components/resources/resource-shell";
import { SideNav } from "@/components/resources/side-nav";
import { JsonLd } from "@/components/shared/layout/json-ld";
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
import { CAPTURED } from "@/content/shots.captured";
import { helpArticles, loadHelpArticle } from "@/lib/help-docs";
import { helpLive } from "@/lib/help-live";
import { resourcesContext } from "@/lib/resources-context";
import { pageMetadata, pageTitle, SITE_URL } from "@/lib/seo";
import { breadcrumbLd, howToLd, techArticleLd } from "@/lib/structured-data";
import { Arrow } from "@saroh/marketing/arrow";
import { Breadcrumbs } from "@saroh/marketing/breadcrumbs";
import { PageTitle } from "@saroh/marketing/page-title";
import { textLinkClasses } from "@saroh/marketing/text-link";

/**
 * One Help article (Resources plan U5, design 2a): the product areas down
 * the side (a Topics menu under 900px), the breadcrumb, title, intro, read
 * time and the day it was last updated, then each step with its picture,
 * "If it doesn't work" when the article has troubles (plan 2026-11-13-002,
 * U9), then Next. "On this page" lists them from 1100px. An article waiting
 * on a release switch that is off is a 404 like an unpublished one.
 *
 * Every article is built at build time; one whose `publishOn` day hasn't
 * begun in India, or any while Help itself isn't live, is a 404 and is
 * linked nowhere (KTD-2). Any other slug is a 404.
 */
export const dynamicParams = false;

/** "If it doesn't work" (boards VH*): the article's troubles, after the steps. */
const TROUBLES_TITLE = "If it doesn't work";
const TROUBLES_ID = "if-it-doesnt-work";

/** A step's captured picture, for the HowTo; none for a drawing or a pending shot. */
function capturedSrc(key: string | undefined): string | undefined {
    const shot = key ? (CAPTURED as Partial<typeof CAPTURED>)[key] : undefined;
    return shot ? `${SITE_URL}${shot.src}` : undefined;
}

export function generateStaticParams() {
    return helpArticles().map((a) => ({ slug: a.slug }));
}

interface Props {
    params: Promise<{ slug: string }>;
}

// `liveArticles`, not `liveBySlug`: it also honours the release switch an
// article waits for (`feature`).
const liveArticle = (slug: string, ctx: PublishContext) =>
    helpLive(ctx)
        ? (liveArticles(helpArticles(), ctx).find((a) => a.slug === slug) ??
          null)
        : null;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params;
    const article = liveArticle(slug, resourcesContext());
    if (!article) return {};
    const meta = pageMetadata({
        title: pageTitle(`${article.title} · Help`),
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
    const headings = [
        ...fm.steps.map((s, i) => ({ id: stepId(i), text: s.title })),
        ...(fm.troubles.length > 0
            ? [{ id: TROUBLES_ID, text: TROUBLES_TITLE }]
            : []),
    ];
    const path = helpHref(fm.slug);

    return (
        <ResourceShell
            className="pt-14"
            side={<SideNav label="Help topics" groups={areas} />}
            aside={<OnThisPage headings={headings} />}
        >
            <article className="grid max-w-[680px] gap-7">
                <JsonLd
                    data={[
                        howToLd({
                            name: fm.title,
                            description: fm.description,
                            url: `${SITE_URL}${path}`,
                            totalMinutes: fm.readMinutes,
                            steps: fm.steps.map((s, i) => ({
                                name: s.title,
                                text: s.body,
                                url: `${SITE_URL}${path}#${stepId(i)}`,
                                image: capturedSrc(s.shot),
                            })),
                        }),
                        techArticleLd({
                            headline: fm.title,
                            description: fm.description,
                            path,
                            publishOn: fm.publishOn,
                            updated: fm.updated,
                        }),
                        // The trail drawn below, ending on this article.
                        breadcrumbLd([
                            { name: "Help", path: HELP_PATH },
                            { name: fm.area },
                            { name: fm.title, path },
                        ]),
                    ]}
                />
                <Breadcrumbs
                    crumbs={[
                        { name: "Help", href: HELP_PATH },
                        { name: fm.area },
                    ]}
                />
                <PageTitle size="article">{fm.title}</PageTitle>
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
                                        className={textLinkClasses({
                                            tone: "prose",
                                            className: "font-semibold",
                                        })}
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
                {fm.troubles.length > 0 ? (
                    <section
                        aria-labelledby={TROUBLES_ID}
                        className="grid scroll-mt-6"
                    >
                        <h2
                            id={TROUBLES_ID}
                            className="m-0 border-b border-border pb-4 font-display text-[22px] font-bold leading-[1.15] tracking-[-0.02em] sm:text-[26px]"
                        >
                            {TROUBLES_TITLE}
                        </h2>
                        {fm.troubles.map((t) => (
                            <div
                                key={t.title}
                                className="grid gap-1.5 border-b border-border py-4 last:border-b-0"
                            >
                                <h3 className="m-0 text-mk-faq font-semibold">
                                    {t.title}
                                </h3>
                                <p className="m-0 text-[17px] leading-[1.6] text-mk-prose [text-wrap:pretty]">
                                    {t.body}
                                </p>
                            </div>
                        ))}
                    </section>
                ) : null}
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
                                className={textLinkClasses({
                                    className:
                                        "w-fit text-mk-faq font-semibold",
                                })}
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
