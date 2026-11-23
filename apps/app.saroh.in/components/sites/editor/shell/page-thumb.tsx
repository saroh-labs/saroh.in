"use client";

import type { FirstPhoto } from "@saroh/block-contract";
import { thumbnailSrc } from "@saroh/block-contract";
import { FileText } from "lucide-react";

/**
 * A page row's picture (ERVBoardFixes 6): the first photo on the page, from
 * its stored smaller copy when it has one; a plain page icon when it has
 * none. Decorative: the row's title names the page.
 */
export function PageThumb({ photo }: { photo: FirstPhoto | null | undefined }) {
    if (!photo) {
        return (
            <FileText
                aria-hidden
                data-page-thumb="icon"
                className="size-4 shrink-0"
            />
        );
    }
    return (
        /* eslint-disable-next-line @next/next/no-img-element -- a tenant's own photos, outside next/image's allowlist */
        <img
            data-page-thumb="photo"
            src={thumbnailSrc(photo.src, photo.widths)}
            alt=""
            loading="lazy"
            className="size-6 shrink-0 rounded-[5px] border object-cover"
        />
    );
}
