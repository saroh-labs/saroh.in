import { Arrow } from "@saroh/marketing/arrow";
import { SwipeRow } from "@saroh/marketing/kit/swipe-row";
import { PageHero } from "@saroh/marketing/page-hero";
import { textLinkClasses } from "@saroh/marketing/text-link";
import Link from "next/link";

import { ButtonLink } from "@/components/shared/button";
import { CtaBand } from "@/components/shared/cta-band";
import { HubPage } from "@/components/shared/hub-head";
import { JsonLd } from "@/components/shared/json-ld";
import { itemListSchema, pageSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { pageOf } from "@/lib/site-map";
import { signupHref } from "@/site.config";

const page = pageOf("/tools");

export const metadata = pageMetadata(page);

const GROUPS: {
    title: string;
    tools: { name: string; line: string; href: string }[];
}[] = [
    {
        title: "Make a document",
        tools: [
            {
                name: "Invoice generator",
                line: "A clean PDF in two minutes, in nine currencies.",
                href: "/tools/invoice-generator",
            },
            {
                name: "Quote and estimate maker",
                line: "A clear price before you start.",
                href: "/tools/quote-maker",
            },
            {
                name: "Receipt maker",
                line: "Show a client they've paid.",
                href: "/tools/receipt-maker",
            },
        ],
    },
    {
        title: "Chase a payment",
        tools: [
            {
                name: "Payment reminder writer",
                line: "Friendly, firm or final, for email or WhatsApp.",
                href: "/tools/payment-reminder",
            },
            {
                name: "Late fee calculator",
                line: "Work out the fee on an overdue invoice.",
                href: "/tools/late-fee-calculator",
            },
        ],
    },
    {
        title: "Work out a number",
        tools: [
            {
                name: "VAT calculator",
                line: "Add VAT or take it out.",
                href: "/tools/vat-calculator",
            },
            {
                name: "Sales tax calculator",
                line: "For US prices and totals.",
                href: "/tools/sales-tax-calculator",
            },
            {
                name: "GST calculator",
                line: "Australia, Canada, NZ, Singapore.",
                href: "/tools/gst-calculator",
            },
        ],
    },
];

const live = GROUPS.flatMap((g) =>
    g.tools.map((t) => ({ name: t.name, path: t.href })),
);

const CARD =
    "box-border flex h-full min-h-[128px] flex-col gap-2 rounded-mk-card p-[22px]";
const NAME =
    "flex items-center justify-between gap-3 font-display text-mk-kit-h3 font-bold";
const LINE = "m-0 text-[15px] leading-normal text-mk-copy";

export default function ToolsHubPage() {
    return (
        <HubPage page={page}>
            <JsonLd
                data={[...pageSchema(page), itemListSchema(page.h1, live)]}
            />
            <PageHero
                crumbs={page.crumb?.map((c) => ({
                    name: c.name,
                    href: c.path,
                }))}
                title={page.h1}
                lead="They run in your browser. No account, no watermark, nothing sent to us. Start with the invoice generator."
                className="px-0 pb-0 min-[760px]:pb-0"
            >
                <div className="flex flex-wrap gap-3">
                    <ButtonLink
                        href="/tools/invoice-generator"
                        data-cta="open-invoice-generator"
                    >
                        Open the invoice generator
                    </ButtonLink>
                </div>
            </PageHero>

            {GROUPS.map((group) => (
                <section key={group.title} className="flex flex-col gap-6">
                    <h2 className="m-0 font-display text-mk-kit-h2 font-bold [text-wrap:balance]">
                        {group.title}
                    </h2>
                    <SwipeRow label={group.title}>
                        {group.tools.map((t) => (
                            <Link
                                key={t.name}
                                prefetch={false}
                                href={t.href}
                                className={`${CARD} border border-border bg-card no-underline transition-colors duration-150 hover:border-foreground`}
                            >
                                <span className={NAME}>
                                    {t.name}
                                    <span aria-hidden="true">→</span>
                                </span>
                                <p className={LINE}>{t.line}</p>
                            </Link>
                        ))}
                    </SwipeRow>
                </section>
            ))}

            <section className="flex flex-col justify-between gap-3 border-t border-border pt-7 md:flex-row md:items-center md:gap-6">
                <p className="m-0 text-[17px] text-mk-copy">
                    Looking for a ready-made file instead? Invoices, quotes and
                    receipts in PDF, Word, Google Docs and Sheets.
                </p>
                <Link
                    prefetch={false}
                    href="/templates"
                    className={textLinkClasses({
                        tone: "ink",
                        className: "shrink-0 text-[17px]",
                    })}
                >
                    Browse templates
                    <Arrow />
                </Link>
            </section>

            <CtaBand
                title="Keep your invoices in one place."
                line="Numbered invoices in your currency, and a record of what's paid. Free plan, no card."
                action="Start free"
                href={signupHref(page.type)}
                from="start-free-band"
            />
        </HubPage>
    );
}
