import type { ComponentType, LazyExoticComponent } from "react";
import { lazy } from "react";

/**
 * Every free tool's component, by slug (#1253): one line per tool, loaded
 * only on its own page. A tool is a client component, default-exported from
 * `src/tools/<slug>/index.tsx`, that takes no props. Tools with their own
 * page in apps/saroh.in (`inApp: true`) are not here.
 *
 * Plain module (no "use client"), so the server can list the slugs for the
 * checks; `lazy` only records the import until `<ToolSlot>` draws it.
 */
export const TOOLS: Readonly<
    Record<string, LazyExoticComponent<ComponentType>>
> = {
    "no-show-cost-calculator": lazy(() => import("./no-show-cost-calculator")),
};

export const hasTool = (slug: string) => Object.keys(TOOLS).includes(slug);
