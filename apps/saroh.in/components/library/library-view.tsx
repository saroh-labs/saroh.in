"use client";

import { LibraryBlocks } from "@saroh/marketing/library/library-blocks";
import type { LibraryGroup } from "@saroh/marketing/library/types";

import { LIBRARY, LIBRARY_TRADES } from "@/content/website-library";
import { track } from "@/lib/analytics";
import {
    COMPONENT_CONTROLS,
    frameWidth,
    LIBRARY_CONTROLS,
    previewSrc,
} from "@/lib/library";
import { ACCOUNTS_URL, cta, LAUNCH_MODE } from "@/lib/links";
import { readAddress } from "@/lib/page-address";
import { keepButtonSource } from "@/lib/referral";

/** The page's query, read the one way a saroh.in page reads it (DEC-127). */
const read = () => readAddress();

/** Where Try's "Use this for my business" says it came from. */
const TRY_SRC = "library-try";

const TRY = {
    words: LIBRARY.try,
    trades: {
        key: "trade",
        label: LIBRARY.try.trade,
        options: LIBRARY_TRADES,
    },
    colourKey: "palette",
    // KD12: name, trade and colour ride the outbound link only.
    startHref: (picked: { name?: string; trade: string; colour: string }) =>
        cta({ src: TRY_SRC, ...picked }).href,
    // No personal data: the page and the mode, as every start button sends.
    onStart: () => {
        keepButtonSource(TRY_SRC, ACCOUNTS_URL);
        track("cta_click", { page: TRY_SRC, mode: LAUNCH_MODE });
    },
};

/** /website-library's Try panel, blocks and toolbar, with saroh.in's address reader and preview route. */
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
            tryIt={TRY}
        />
    );
}
