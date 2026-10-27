"use client";

import { Suspense } from "react";

import { TOOLS } from "./registry";

/** Where `<ToolPage>` draws the tool itself, from the registry. */
export function ToolSlot({ slug }: { slug: string }) {
    const Tool = TOOLS[slug];
    if (!Tool) return null;
    return (
        <Suspense fallback={<div className="tp-tool tp-loading" />}>
            <Tool />
        </Suspense>
    );
}
