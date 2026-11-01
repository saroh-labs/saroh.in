"use client";

import { Suspense } from "react";

import type { ToolRegistry } from "./registry";

export type { ToolRegistry };

/**
 * Where `<ToolPage>` draws the tool itself, from `tools`: saroh.in's
 * generated registry (only the tools its build has) or every tool's
 * (`EveryToolSlot`, admin). It never imports a registry itself, so a site
 * builds no chunk for a tool it doesn't carry.
 */
export function ToolSlot({
    slug,
    tools,
}: {
    slug: string;
    tools: ToolRegistry;
}) {
    const Tool = tools[slug];
    if (!Tool) return null;
    return (
        <Suspense fallback={<div className="tp-tool tp-loading" />}>
            <Tool />
        </Suspense>
    );
}
