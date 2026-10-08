import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Eyebrow } from "@/components/v2/eyebrow";
import { HelpSearch } from "@/components/v2/help/help-search";
import {
    groupsWithArticles,
    HELP_EMAIL,
    HELP_PATH,
    helpHome,
    helpHref,
    liveArticles,
    summarise,
} from "@/content/help";
import { helpArticles } from "@/lib/help-docs";
import { helpLive } from "@/lib/help-live";
import { resourcesContext } from "@/lib/resources-context";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
    title: helpHome.seo.title,
    socialTitle: helpHome.seo.socialTitle,
    description: helpHome.seo.description,
    path: HELP_PATH,
});

const LINK =
    "w-fit cursor-pointer rounded-sm text-mk-copy no-underline transition-colors duration-fast ease-out hover:text-brand-700 active:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid]";

/**
 * Help's home (Resources plan U5, design 1a): the title, a search over the
 * published articles, then "What are you trying to do?" with each task
 * group's published articles. A group with none is not drawn and nothing
 * shows a count (R17). Before Help's day (17 Oct) the page is a 404 and is
 * linked nowhere (KTD-2); `RESOURCES_PREVIEW` shows it on previews and
 * locally.
 */
export default function HelpPage() {
    const ctx = resourcesContext();
    if (!helpLive(ctx)) notFound();
    const articles = liveArticles(helpArticles().map(summarise), ctx);
    const groups = groupsWithArticles(articles);
    return (
        <>
            <header className="grid max-w-[860px] gap-[22px] px-mk-gutter pt-20">
                <h1 className="m-0 font-display text-[clamp(36px,6vw,60px)] font-bold leading-none tracking-[-0.045em]">
                    {helpHome.title}
                </h1>
                <HelpSearch articles={articles} />
            </header>
            {groups.length > 0 ? (
                <section aria-labelledby="tasks" className="pt-20">
                    <Eyebrow
                        id="tasks"
                        className="px-mk-gutter"
                        role="heading"
                        aria-level={2}
                    >
                        {helpHome.groupsTitle}
                    </Eyebrow>
                    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] gap-x-14 px-mk-gutter pt-6">
                        {groups.map(({ group, articles: list }) => (
                            <div
                                key={group}
                                className="grid content-start gap-2.5 border-t border-border py-7"
                            >
                                <h3 className="m-0 font-display text-[24px] font-bold tracking-[-0.02em]">
                                    {group}
                                </h3>
                                <ul className="m-0 grid list-none gap-1.5 p-0 text-mk-faq">
                                    {list.map((a) => (
                                        <li key={a.slug}>
                                            <Link
                                                href={helpHref(a.slug)}
                                                className={LINK}
                                            >
                                                {a.title}
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </section>
            ) : null}
            <div className="px-mk-gutter pt-16">
                <div className="flex flex-wrap gap-x-10 gap-y-4 border-t border-border pt-6 text-[15px] leading-[1.6] text-mk-copy">
                    <span className="max-w-[46ch]">
                        <strong className="font-semibold text-foreground">
                            Can&apos;t find it?
                        </strong>{" "}
                        Write to{" "}
                        <a
                            href={`mailto:${HELP_EMAIL}`}
                            className="cursor-pointer rounded-sm text-brand-700 underline-offset-[3px] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid]"
                        >
                            {HELP_EMAIL}
                        </a>
                        . A person reads every email.
                    </span>
                    <span className="max-w-[46ch]">
                        <strong className="font-semibold text-foreground">
                            Something new?
                        </strong>{" "}
                        See what&apos;s changed in the{" "}
                        <Link
                            href="/changelog"
                            className="cursor-pointer rounded-sm text-brand-700 underline-offset-[3px] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid]"
                        >
                            changelog
                        </Link>
                        .
                    </span>
                </div>
            </div>
        </>
    );
}
