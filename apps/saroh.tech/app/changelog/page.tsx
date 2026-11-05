import { ComingList } from "@saroh/marketing/coming-list";
import { Eyebrow } from "@saroh/marketing/eyebrow";
import { PageTitle } from "@saroh/marketing/page-title";
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
            className="mx-auto max-w-mk-page px-mk-gutter pt-6 md:pt-12"
        >
            <div className="flex max-w-[940px] flex-col gap-6">
                <div className="flex flex-col gap-3.5">
                    <PageTitle size="page">{page.h1}</PageTitle>
                    <p className="m-0 text-[17px] leading-[1.6] text-mk-copy md:text-[19px]">
                        Every change to Saroh, newest first. <b>Global</b> means
                        saroh.tech only. <b>Both</b> means saroh.tech and
                        saroh.in.
                    </p>
                </div>
                <ChangelogList />
                <section aria-labelledby="coming" className="grid gap-1 pt-10">
                    <Eyebrow
                        as="h2"
                        id="coming"
                        tone="muted"
                        className="m-0 pb-1"
                    >
                        {COMING_TITLE}
                    </Eyebrow>
                    <p className="m-0 mb-3 max-w-[70ch] text-[15px] leading-[1.6] text-mk-copy">
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
