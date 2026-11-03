import type { Metadata } from "next";

import { ChangelogList } from "@/components/content/changelog-list";
import { CtaBand } from "@/components/shared/cta-band";
import { canonicalOf, pageMetadata } from "@/lib/seo";
import { pageOf } from "@/lib/site-map";
import { signupHref } from "@/site.config";

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
            className="mx-auto max-w-[1440px] px-4 pt-6 md:px-20 md:pt-12"
        >
            <div className="flex max-w-[940px] flex-col gap-6">
                <div className="flex flex-col gap-3.5">
                    <h1 className="m-0 font-display text-[38px] font-bold leading-[0.98] tracking-[-0.05em] md:text-[72px]">
                        {page.h1}
                    </h1>
                    <p className="m-0 text-[17px] leading-[1.6] text-body md:text-[19px]">
                        Every change to Saroh, newest first. <b>Global</b> means
                        saroh.tech only. <b>Both</b> means saroh.tech and
                        saroh.in.
                    </p>
                </div>
                <ChangelogList />
            </div>
            <div className="pt-10 md:pt-16">
                <CtaBand
                    title="We ship every week."
                    line="Try what's new on the free plan."
                    action="Start free"
                    href={signupHref("changelog")}
                    from="start-free-band"
                />
            </div>
        </div>
    );
}
