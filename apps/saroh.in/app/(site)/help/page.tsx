import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { HelpSearch } from "@/components/help/help-search";
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
import { PageHero } from "@saroh/marketing/page-hero";
import { textLinkClasses } from "@saroh/marketing/text-link";

/** A link inside a sentence: underlined, not told apart by colour alone. */
const RUNNING_TEXT =
    "text-foreground underline decoration-border-strong underline-offset-[3px] hover:decoration-foreground";

export const metadata: Metadata = pageMetadata({
    title: helpHome.seo.title,
    socialTitle: helpHome.seo.socialTitle,
    description: helpHome.seo.description,
    path: HELP_PATH,
});

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
            <PageHero title={helpHome.title} mark="help">
                <div className="max-w-[640px]">
                    <HelpSearch articles={articles} />
                </div>
            </PageHero>
            {groups.length > 0 ? (
                <section
                    aria-labelledby="tasks"
                    className="mx-auto max-w-mk-page px-mk-gutter pt-6 min-[760px]:pt-10"
                >
                    <h2
                        id="tasks"
                        className="m-0 font-display text-mk-kit-h2 font-bold [text-wrap:balance]"
                    >
                        {helpHome.groupsTitle}
                    </h2>
                    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] gap-x-14 pt-8">
                        {groups.map(({ group, articles: list }) => (
                            <div
                                key={group}
                                className="grid content-start gap-2.5 border-t border-border py-7"
                            >
                                <h3 className="m-0 font-display text-mk-kit-h3 font-bold">
                                    {group}
                                </h3>
                                <ul className="m-0 grid list-none gap-0.5 p-0 text-[16px]">
                                    {list.map((a) => (
                                        <li key={a.slug}>
                                            <Link
                                                href={helpHref(a.slug)}
                                                className={textLinkClasses({
                                                    tone: "copy",
                                                    className:
                                                        "inline-flex min-h-11 w-fit items-center py-1",
                                                })}
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
            <div className="mx-auto max-w-mk-page px-mk-gutter pb-[72px] pt-16 min-[760px]:pb-[120px]">
                <div className="flex flex-wrap gap-x-10 gap-y-4 border-t border-border pt-6 text-[16px] leading-[1.6] text-mk-copy">
                    <span className="max-w-[46ch]">
                        <strong className="font-semibold text-foreground">
                            Can&apos;t find it?
                        </strong>{" "}
                        Write to{" "}
                        <a
                            href={`mailto:${HELP_EMAIL}`}
                            className={textLinkClasses({
                                className: RUNNING_TEXT,
                            })}
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
                            className={textLinkClasses({
                                className: RUNNING_TEXT,
                            })}
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
