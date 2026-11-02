import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { TemplatePage } from "@/components/templates/template-page";
import { pageMetadata } from "@/lib/seo";
import { pageAt, pageOf } from "@/lib/site-map";
import { templateAt, templatePages } from "@/lib/templates/pages";

export const dynamicParams = false;

interface Props {
    params: Promise<{ document: string }>;
}

export function generateStaticParams() {
    return templatePages
        .filter((p) => !p.trade && !p.country)
        .map((p) => ({ document: p.document.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { document } = await params;
    const page = pageAt(`/templates/${document}`);
    return page ? pageMetadata(page) : {};
}

export default async function Page({ params }: Props) {
    const { document } = await params;
    const path = `/templates/${document}`;
    const data = templateAt(path);
    if (!data) notFound();
    return <TemplatePage page={pageOf(path)} data={data} />;
}
