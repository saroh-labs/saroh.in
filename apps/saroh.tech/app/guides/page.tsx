import { SwipeRow } from "@saroh/marketing/kit/swipe-row";

import { ButtonLink } from "@/components/shared/button";
import { LinkCard } from "@/components/shared/card";
import { CtaBand } from "@/components/shared/cta-band";
import { HubHead } from "@/components/shared/hub-head";
import { GUIDE_CONTENT, GUIDE_GROUPS } from "@/content/guides";
import { pageMetadata } from "@/lib/seo";
import { pageOf } from "@/lib/site-map";
import { signupHref } from "@/site.config";

const page = pageOf("/guides");

export const metadata = pageMetadata(page);

export default function Page() {
    return (
        <div
            data-page-type={page.type}
            className="mx-auto flex max-w-mk-page flex-col gap-12 px-mk-gutter min-[760px]:gap-[72px]"
        >
            <HubHead
                page={page}
                action={
                    <div>
                        <ButtonLink
                            href="/guides/how-to-write-an-invoice"
                            data-cta="guides-first"
                        >
                            How to write an invoice
                        </ButtonLink>
                    </div>
                }
            >
                Plain answers on writing invoices and quotes, asking for payment
                and setting your rate. Start with how to write an invoice.
            </HubHead>

            {GUIDE_GROUPS.map((group) => (
                <section key={group} className="flex flex-col gap-6">
                    <h2 className="m-0 font-display text-mk-kit-h2 font-bold [text-wrap:balance]">
                        {group}
                    </h2>
                    <SwipeRow label={group}>
                        {GUIDE_CONTENT.filter((g) => g.group === group).map(
                            (g) => (
                                <LinkCard
                                    key={g.slug}
                                    href={`/guides/${g.slug}`}
                                    title={g.card.title}
                                    line={g.card.line}
                                    className="h-full"
                                />
                            ),
                        )}
                    </SwipeRow>
                </section>
            ))}

            <CtaBand
                title="Keep it all in one place."
                line="Numbered invoices in your currency, and a record of what's paid. Free plan, no card."
                action="Start free"
                href={signupHref("guides")}
                from="start-free-band"
            />
        </div>
    );
}
