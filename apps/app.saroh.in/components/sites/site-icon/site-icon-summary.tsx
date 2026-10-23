import { cn } from "@saroh/ui/lib/utils";

import type { ShownSiteIcon } from "@/lib/sites/site-icon";
import { SITE_ICON_LINE } from "@/lib/sites/site-icon";

/** A site's icon at a given size: an uploaded image, the logo or the tile. */
export function SiteIconImage({
    src,
    className,
}: {
    src: string;
    className?: string;
}) {
    return (
        // eslint-disable-next-line @next/next/no-img-element -- a merchant's uploaded image or the site's own drawn tile, not a project asset
        <img
            src={src}
            alt=""
            className={cn("shrink-0 rounded-sm object-cover", className)}
        />
    );
}

/**
 * The "Site icon" row's value: the icon the site shows, small, and one line
 * saying which it is. Shared by the editable row and the read-only one.
 */
export function SiteIconSummary({ shown }: { shown: ShownSiteIcon }) {
    return (
        <div className="flex items-center gap-3">
            <SiteIconImage src={shown.src} className="size-8" />
            <span data-icon-source={shown.source}>
                {SITE_ICON_LINE[shown.source]}
            </span>
        </div>
    );
}
