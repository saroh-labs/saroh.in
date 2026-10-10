"use client";

import { usePathname } from "next/navigation";

import {
    isNavChildCurrent,
    isNavSectionActive,
    NAV_GROUPS,
    navPathname,
} from "@/components/shared/nav-items";
import type { PageShape } from "@/components/shared/page-loading";
import { PageLoading } from "@/components/shared/page-loading";

/** What the shell's own loader says for an address: where you are going. */
export interface ShellLoadingWords {
    breadcrumb: string[];
    /** The page's title, only when the address is a section's own page. */
    title?: string;
    shape: PageShape;
    label: string;
}

/**
 * The words for the loader the whole shell shares.
 *
 * The router shows the OUTERMOST loading file first on every move between
 * sections, before the section's own. That file used to say "Home" whatever
 * the address, so every page flashed Home's name on its way in. It now reads
 * the address against the same menu the rail draws: the section and page you
 * pressed, and a bar for a title it can't know (a record's page).
 */
export function shellLoadingWords(pathname: string): ShellLoadingWords {
    if (pathname === "/") {
        return {
            breadcrumb: ["Home"],
            shape: "dashboard",
            label: "Loading Home",
        };
    }
    if (pathname === "/settings" || pathname.startsWith("/settings/")) {
        return {
            breadcrumb: ["Settings"],
            shape: "settings",
            label: "Loading Settings",
        };
    }
    const at = navPathname(pathname, NAV_GROUPS);
    for (const group of NAV_GROUPS) {
        for (const item of group.items) {
            if (item.href === "/" || !isNavSectionActive(at, item)) continue;
            const children = item.children ?? [];
            const child = children.find((c) =>
                isNavChildCurrent(at, c.href, children),
            );
            const breadcrumb = child ? [item.label, child.label] : [item.label];
            const own = child ? child.href : item.href;
            const name = child ? child.label : item.label;
            return pathname === own
                ? {
                      breadcrumb,
                      title: name,
                      shape: "list",
                      label: `Loading ${name}`,
                  }
                : { breadcrumb, shape: "detail", label: "Loading" };
        }
    }
    return { breadcrumb: [], shape: "detail", label: "Loading" };
}

/** The shell's loader: named for the page being opened, never for Home. */
export function ShellLoading() {
    const words = shellLoadingWords(usePathname());
    return (
        <PageLoading
            shape={words.shape}
            width="full"
            breadcrumb={words.breadcrumb.length ? words.breadcrumb : undefined}
            title={words.title}
            label={words.label}
        />
    );
}
