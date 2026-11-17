import { ComingList } from "@saroh/marketing/coming-list";
import { PageHero } from "@saroh/marketing/page-hero";
import type { Metadata } from "next";

import { ChangelogBand } from "@/components/content/changelog-entry";
import { ChangelogList } from "@/components/content/changelog-list";
import {
    COMING,
    COMING_INTRO,
    COMING_TITLE,
    NOT_AVAILABLE_YET,
} from "@/content/coming";
import { canonicalOf, pageMetadata } from "@/lib/seo";
import { pageOf } from "@/lib/site-map";

const page = pageOf("/changelog");
const base = pageMetadata(page);

export const metadata: Metadata = {
    ...base,
    alternates: {
        ...base.alternates,
        types: { "application/rss+xml": canonicalOf("/changelog/rss.xml") },
    },
};

/** The spec asks for no structured data on the list. */
export default function Page() {
    return (
        <div
            data-page-type={page.type}
            className="mx-auto max-w-mk-page px-mk-gutter"
        >
            <PageHero
                title={page.h1}
                className="px-0"
                lead={
                    <>
                        Every change to Saroh, newest first. <b>Global</b> means
                        saroh.tech only. <b>Both</b> means saroh.tech and
                        saroh.in.
                    </>
                }
            />
            <div className="flex max-w-[940px] flex-col gap-6">
                <ChangelogList />
                <section
                    aria-labelledby="coming"
                    className="grid gap-5 pt-[72px] min-[760px]:pt-[120px]"
                >
                    <h2
                        id="coming"
                        className="m-0 font-display text-mk-kit-h2 font-bold [text-wrap:balance]"
                    >
                        {COMING_TITLE}
                    </h2>
                    <p className="m-0 mb-4 max-w-[70ch] text-[16px] leading-[1.6] text-mk-copy">
                        {COMING_INTRO}
                    </p>
                    <ComingList
                        groups={COMING}
                        idPrefix="coming"
                        mark={NOT_AVAILABLE_YET}
                    />
                </section>
            </div>
            <ChangelogBand />
        </div>
    );
}
