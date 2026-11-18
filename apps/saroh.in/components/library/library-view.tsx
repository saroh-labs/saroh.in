"use client";

import { LibraryBlocks } from "@saroh/marketing/library/library-blocks";
import type { LibraryGroup } from "@saroh/marketing/library/types";

import { LIBRARY } from "@/content/website-library";
import {
    COMPONENT_CONTROLS,
    frameWidth,
    LIBRARY_CONTROLS,
    previewSrc,
} from "@/lib/library";
import { readAddress } from "@/lib/page-address";

/** The page's query, read the one way a saroh.in page reads it (DEC-127). */
const read = () => readAddress();

/** /website-library's blocks and toolbar, with saroh.in's address reader and preview route. */
export function LibraryView({ groups }: { groups: LibraryGroup[] }) {
    return (
        <LibraryBlocks
            groups={groups}
            controls={LIBRARY_CONTROLS}
            componentControls={COMPONENT_CONTROLS}
            words={LIBRARY}
            read={read}
            previewSrc={previewSrc}
            frameWidth={frameWidth}
        />
    );
}
