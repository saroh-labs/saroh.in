import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { RelatedGrid } from "@/components/shared/related-grid";
import { ExampleItems, PaymentTerms } from "@/components/templates/blocks";
import { GalleryPage } from "@/components/templates/gallery";
import { TRADES } from "@/content/templates";
import { pageMetadata } from "@/lib/seo";
import { pageAt, pageOf } from "@/lib/site-map";
import { tradeHubPages } from "@/lib/templates/pages";

export const dynamicParams = false;

interface Props {
    params: Promise<{ trade: string }>;
}

export function generateStaticParams() {
    return TRADES.map((t) => ({ trade: t.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { trade } = await params;
    const page = pageAt(`/templates/for/${trade}`);
    return page ? pageMetadata(page) : {};
}

export default async function Page({ params }: Props) {
    const { trade: slug } = await params;
    const trade = TRADES.find((t) => t.slug === slug);
    if (!trade) notFound();
    const near = trade.near
        .slice(0, 3)
        .map((n) => TRADES.find((t) => t.slug === n))
        .filter((t) => t !== undefined);
    return (
        <GalleryPage
            page={pageOf(`/templates/for/${slug}`)}
            lede={
                trade.data?.lede ??
                `Invoices, quotes and receipts for ${trade.plural}. Start from a plain template and fill in your own work.`
            }
            pages={tradeHubPages(slug)}
        >
            {trade.data ? (
                <section className="grid gap-10 lg:grid-cols-2 lg:gap-16">
                    <ExampleItems
                        items={trade.data.items}
                        fields={trade.data.fields}
                    />
                    <PaymentTerms
                        title={`How ${trade.plural} get paid`}
                        text={trade.data.payment.text}
                        points={trade.data.payment.points}
                    />
                </section>
            ) : null}
            <RelatedGrid
                title="Templates for similar work"
                items={near.map((t) => ({
                    title: `Templates for ${t.plural}`,
                    line: `Invoices, quotes and receipts for ${t.plural}.`,
                    href: `/templates/for/${t.slug}`,
                }))}
            />
        </GalleryPage>
    );
}
