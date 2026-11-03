import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { RelatedGrid } from "@/components/shared/related-grid";
import {
    CountryFacts,
    ExampleItems,
    PaymentTerms,
} from "@/components/templates/blocks";
import { GalleryPage } from "@/components/templates/gallery";
import { COUNTRIES } from "@/content/templates";
import { pageMetadata } from "@/lib/seo";
import { pageAt, pageOf } from "@/lib/site-map";
import { countryHubPages } from "@/lib/templates/pages";

export const dynamicParams = false;

interface Props {
    params: Promise<{ country: string }>;
}

export function generateStaticParams() {
    return COUNTRIES.map((c) => ({ country: c.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { country } = await params;
    const page = pageAt(`/templates/in/${country}`);
    return page ? pageMetadata(page) : {};
}

export default async function Page({ params }: Props) {
    const { country: slug } = await params;
    const country = COUNTRIES.find((c) => c.slug === slug);
    if (!country) notFound();
    const others = COUNTRIES.filter((c) => c !== country).slice(0, 3);
    return (
        <GalleryPage
            page={pageOf(`/templates/in/${slug}`)}
            lede={
                country.data?.lede ??
                `Invoices and quotes you can use in ${country.place}. Start from a plain template, then set your own currency and ${country.tax} line.`
            }
            pages={countryHubPages(slug)}
        >
            {country.data ? (
                <>
                    <CountryFacts
                        name={country.place}
                        facts={country.data.facts}
                    />
                    <section className="grid gap-10 lg:grid-cols-2 lg:gap-16">
                        <ExampleItems items={[]} fields={country.data.fields} />
                        <PaymentTerms
                            title={`Getting paid in ${country.place}`}
                            text={country.data.payment.text}
                            points={country.data.payment.points}
                        />
                    </section>
                </>
            ) : null}
            <RelatedGrid
                title="Templates for other countries"
                items={others.map((c) => ({
                    title: `Templates for ${c.place}`,
                    line: `Invoices and quotes with the ${c.tax} line.`,
                    href: `/templates/in/${c.slug}`,
                }))}
            />
        </GalleryPage>
    );
}
