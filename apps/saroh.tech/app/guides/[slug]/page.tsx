import type { Metadata } from "next";

import { GuidePage } from "@/components/content/guide-page";
import { GUIDE_CONTENT, guideOf } from "@/content/guides";
import { pageMetadata } from "@/lib/seo";
import { pageOf } from "@/lib/site-map";

export const dynamicParams = false;

export const generateStaticParams = () =>
    GUIDE_CONTENT.map(({ slug }) => ({ slug }));

interface Props {
    params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    return pageMetadata(pageOf(`/guides/${(await params).slug}`));
}

export default async function Page({ params }: Props) {
    const { slug } = await params;
    return <GuidePage page={pageOf(`/guides/${slug}`)} guide={guideOf(slug)} />;
}
