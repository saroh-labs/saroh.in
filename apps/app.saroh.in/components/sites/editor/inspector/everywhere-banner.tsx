"use client";

import { Button } from "@saroh/ui/button";
import { Globe } from "lucide-react";

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
 * and the way back to this page's sections. One ink line with a globe
 * (H1): the page names give way, never the two ways out.
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
            className="mx-4 mt-3 flex h-10 min-w-0 shrink-0 items-center gap-2.5 rounded-[9px] bg-foreground pl-3.5 pr-1.5 text-[0.8125rem] font-semibold text-background"
        >
            <Globe aria-hidden className="size-4 shrink-0" />
            <p className="min-w-0 flex-1 truncate">
                Changes here show on all {count(pages.length, "page")}
                <span data-ph-mask="" className="font-normal opacity-80">
                    {" "}
                    · {pagesLine(pages)}
                </span>
            </p>
            <Button
                type="button"
                variant="link"
                size="inline"
                onClick={onSeePages}
                className="shrink-0 whitespace-nowrap font-semibold text-background underline decoration-background/50 underline-offset-[3px]"
            >
                See the {count(pages.length, "page")}
            </Button>
            <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-[30px] shrink-0"
                onClick={onBack}
            >
                Back to this page&apos;s sections
            </Button>
        </div>
    );
}
