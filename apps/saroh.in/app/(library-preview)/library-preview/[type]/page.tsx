import {
    LOOK_IDS,
    presetSiteStyle,
    SECTION_TYPES,
    siteStyleVariables,
} from "@saroh/block-contract";
import { getTemplate } from "@saroh/templates";
import { notFound } from "next/navigation";

import { LIBRARY_COLOURWAYS } from "@/content/website-library";
import { libraryLive } from "@/lib/library-live";
import { resourcesContext } from "@/lib/resources-context";

import { BlockPreview } from "./block-preview";

/** One built file per block; any other address is the 404. */
export const dynamicParams = false;

export function generateStaticParams() {
    return SECTION_TYPES.map((type) => ({ type }));
}

/**
 * Each colourway's `--site-*` variables in each look (Classic as `classic`),
 * worked out at build from the templates' own colourways, as a site in that
 * colourway publishes them (`presetSiteStyle`, `siteStyleVariables`).
 */
function colourwayVariables(): Record<
    string,
    Record<string, Record<string, string>>
> {
    return Object.fromEntries(
        LIBRARY_COLOURWAYS.map((c) => {
            const preset = getTemplate(c.template)?.styles?.find(
                (s) => s.id === c.style,
            );
            const style = presetSiteStyle(preset?.style ?? {});
            return [
                c.id,
                Object.fromEntries(
                    (["classic", ...LOOK_IDS] as const).map((look) => [
                        look,
                        siteStyleVariables(
                            look === "classic" ? style : { ...style, look },
                        ),
                    ]),
                ),
            ];
        }),
    );
}

/**
 * ONE block in the website library's toolbar choices, with nothing else on
 * the page (the ui.saroh.in preview pattern, KD11): /website-library frames
 * it at a desk's or a phone's width, because the blocks' breakpoints follow
 * the viewport. The page is one built file per block; its look, colours,
 * layout and component styles are read from its address in the browser
 * (`BlockPreview`). `noindex` (layout and `next.config.js`).
 */
export default async function LibraryPreviewPage({
    params,
}: {
    params: Promise<{ type: string }>;
}) {
    if (!libraryLive(resourcesContext())) notFound();
    const { type } = await params;
    return <BlockPreview type={type} variables={colourwayVariables()} />;
}
