import type { Metadata } from "next";

import {
    ComingNextList,
    EntryRow,
    FirstEntrySoon,
} from "@/components/v2/changelog/changelog-list";
import { ChangelogSignup } from "@/components/v2/changelog/changelog-signup";
import { CHANGELOG, changelogView } from "@/content/changelog";
import { resourcesContext } from "@/lib/resources-context";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
    title: CHANGELOG.metaTitle,
    socialTitle: "Saroh changelog",
    description: CHANGELOG.metaDescription,
    path: "/changelog",
});

/**
 * The changelog (plan U4, design "Changelog" 1a): the title, the one email
 * field, the entries newest first, then Coming next. Before the first
 * entry's day (17 Oct) the entry's place says when it comes (R15); from that
 * day the entry is there once the site is next deployed: the page is built
 * at deploy time, and nothing rebuilds it on a schedule (`app/layout.tsx`).
 */
export default function ChangelogPage() {
    const view = changelogView(resourcesContext());
    return (
        <>
            <header className="mx-auto grid w-full max-w-[900px] gap-[18px] px-6 pt-20">
                <h1 className="m-0 font-display text-[clamp(36px,6vw,60px)] font-bold leading-none tracking-[-0.045em]">
                    {CHANGELOG.title}
                </h1>
                <p className="m-0 text-mk-intro text-mk-copy">
                    {CHANGELOG.sub}
                </p>
                <ChangelogSignup />
            </header>
            <section
                aria-label="Entries"
                className="mx-auto grid w-full max-w-[900px] px-6 pt-14"
            >
                {view.state === "entries" ? (
                    view.entries.map((entry) => (
                        <EntryRow key={entry.slug} entry={entry} />
                    ))
                ) : view.firstDay ? (
                    <FirstEntrySoon day={view.firstDay} />
                ) : null}
            </section>
            <ComingNextList />
        </>
    );
}
