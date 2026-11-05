"use client";

import { TOOLS } from "./registry";
import { ToolSlot } from "./tool-slot";

/** Any tool in the code, drafts too: admin's preview and the package's tests (`@saroh/search-pages/tools`). */
export function EveryToolSlot({ slug }: { slug: string }) {
    return <ToolSlot slug={slug} tools={TOOLS} />;
}
