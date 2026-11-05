"use client";

import { ToolSlot } from "@saroh/search-pages/tool-slot";

import { TOOLS } from "@/lib/tool-registry.gen";

/**
 * A free tool on its page, from the registry this build wrote
 * (`docs-content.config.ts`): only the tools it carries, so a draft tool's
 * code is no chunk of a production build (plan 2026-11-01-001, U3).
 */
export function SiteToolSlot({ slug }: { slug: string }) {
    return <ToolSlot slug={slug} tools={TOOLS} />;
}
