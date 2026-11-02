import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { TemplatePage } from "@/components/templates/template-page";
import { pageMetadata } from "@/lib/seo";
import { pageAt, pageOf } from "@/lib/site-map";
import { templateAt, templatePages } from "@/lib/templates/pages";

export const dynamicParams = false;

interface Props {
    params: Promise<{ document: string; slug: string }>;
}

export function generateStaticParams() {
    return templatePages.flatMap((p) => {
        const own = p.trade ?? p.country;
        return own ? [{ document: p.document.slug, slug: own.slug }] : [];
    });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { document, slug } = await params;
    const page = pageAt(`/templates/${document}/${slug}`);
    return page ? pageMetadata(page) : {};
}

export default async function Page({ params }: Props) {
    const { document, slug } = await params;
    const path = `/templates/${document}/${slug}`;
    const data = templateAt(path);
    if (!data) notFound();
    return <TemplatePage page={pageOf(path)} data={data} />;
}
