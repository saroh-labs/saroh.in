"use client";

import { Button } from "@saroh/ui/button";

import { count } from "@/lib/format/plural";
import type { SitePage } from "@/lib/sites/service";

/** "Home, Services, Bridal and 11 more": three names, then the rest. */
export function pagesLine(pages: readonly Pick<SitePage, "title">[]): string {
    const names = pages.slice(0, 3).map((p) => p.title);
    const rest = pages.length - names.length;
    return rest > 0
        ? `${names.join(", ")} and ${rest} more`
        : names.join(", ").replace(/, ([^,]*)$/, " and $1");
}

/**
 * Over the canvas while the header or footer is selected (U47,
 * `fix/WXMGlobal`): what changes here changes on every page, which pages,
 * and the way back to this page's sections.
 */
export function EverywhereBanner({
    pages,
    onSeePages,
    onBack,
}: {
    pages: readonly Pick<SitePage, "title">[];
    /** "See the n pages": the Pages tree. */
    onSeePages: () => void;
    /** "Back to this page's sections": nothing selected, the tree. */
    onBack: () => void;
}) {
    return (
        <div
            role="status"
            data-everywhere-banner=""
            className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b bg-info-subtle px-4 py-2 text-sm text-info-subtle-foreground"
        >
            <p className="min-w-0 flex-1">
                <span className="font-semibold">
                    Changes here show on all {count(pages.length, "page")}
                </span>
                <span data-ph-mask=""> · {pagesLine(pages)}</span>
            </p>
            <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0 font-semibold text-inherit"
                onClick={onSeePages}
            >
                See the {count(pages.length, "page")}
            </Button>
            <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0 font-semibold text-inherit"
                onClick={onBack}
            >
                Back to this page&apos;s sections
            </Button>
        </div>
    );
}
