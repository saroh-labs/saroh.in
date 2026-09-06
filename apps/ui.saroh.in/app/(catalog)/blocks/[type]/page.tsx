import {
    BLOCK_META,
    SECTION_TYPES,
    isSectionType,
} from "@saroh/block-contract";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import BlockDetail from "@/components/pages/blocks/detail";

export function generateStaticParams() {
    return SECTION_TYPES.map((type) => ({ type }));
}

export async function generateMetadata({
    params,
}: {
    params: Promise<{ type: string }>;
}): Promise<Metadata> {
    const { type } = await params;
    if (!isSectionType(type)) return { title: "Not found — saroh/ui" };
    return {
        title: `${BLOCK_META[type].label} — saroh/ui`,
        description: BLOCK_META[type].description,
    };
}

export default async function Page({
    params,
}: {
    params: Promise<{ type: string }>;
}) {
    const { type } = await params;
    if (!isSectionType(type)) notFound();
    return <BlockDetail type={type} />;
}
