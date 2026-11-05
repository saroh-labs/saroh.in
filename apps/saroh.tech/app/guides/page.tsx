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
            className="mx-auto flex max-w-mk-page flex-col gap-9 px-mk-gutter pt-4 md:gap-[52px] md:pt-10"
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
                <section key={group} className="flex flex-col gap-[18px]">
                    <h2 className="m-0 font-display text-mk-h2-xs font-bold [text-wrap:balance]">
                        {group}
                    </h2>
                    <div className="grid gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-4">
                        {GUIDE_CONTENT.filter((g) => g.group === group).map(
                            (g) => (
                                <LinkCard
                                    key={g.slug}
                                    href={`/guides/${g.slug}`}
                                    title={g.card.title}
                                    line={g.card.line}
                                />
                            ),
                        )}
                    </div>
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
