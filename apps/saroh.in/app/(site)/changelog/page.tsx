import type { Metadata } from "next";

import {
    ComingNextList,
    EntryRow,
    FirstEntrySoon,
} from "@/components/changelog/changelog-list";
import { ChangelogSignup } from "@/components/changelog/changelog-signup";
import { Container } from "@/components/shared/layout/container";
import { PageTitle } from "@/components/shared/sections/page-title";
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
            <Container
                as="header"
                width="list"
                className="grid gap-[18px] pt-20"
            >
                <PageTitle size="page">{CHANGELOG.title}</PageTitle>
                <p className="m-0 text-mk-intro text-mk-copy">
                    {CHANGELOG.sub}
                </p>
                <ChangelogSignup />
            </Container>
            <Container
                as="section"
                width="list"
                aria-label="Entries"
                className="grid pt-14"
            >
                {view.state === "entries" ? (
                    view.entries.map((entry) => (
                        <EntryRow key={entry.slug} entry={entry} />
                    ))
                ) : view.firstDay ? (
                    <FirstEntrySoon day={view.firstDay} />
                ) : null}
            </Container>
            <ComingNextList />
        </>
    );
}
