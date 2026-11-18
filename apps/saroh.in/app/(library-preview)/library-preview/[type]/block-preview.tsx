"use client";

import { componentStyleVariables } from "@saroh/block-contract";
import { PREVIEW_MARK } from "@saroh/marketing/library/block-frame";
import { BlockFixturePreview, SiteTheme } from "@saroh/site-blocks";

import { previewChoice } from "@/lib/library";
import { readAddress } from "@/lib/page-address";
import { useBrowserValue } from "@/lib/use-browser-value";

const read = () => readAddress();

/**
 * The block, drawn as a merchant's site draws it: `SiteTheme` on `:root`
 * (this document IS one merchant's page) with the colourway's variables in
 * the chosen look and the component choices on top, then the block's
 * example content (`BlockFixturePreview`). Nothing is drawn on the server:
 * the choices are in the address.
 */
export function BlockPreview({
    type,
    variables,
}: {
    type: string;
    /** By colourway, then look (`classic` for none). */
    variables: Record<string, Record<string, Record<string, string>>>;
}) {
    const search = useBrowserValue<string | null>(read, null);
    const choice = search === null ? null : previewChoice(type, search);
    const vars = choice
        ? {
              ...variables[choice.palette][choice.look ?? "classic"],
              ...componentStyleVariables(choice.components),
          }
        : null;
    return (
        <div
            {...{ [PREVIEW_MARK]: "" }}
            className="bg-site-bg text-site-fg min-h-screen"
        >
            {choice && vars ? (
                <>
                    <SiteTheme variables={vars} look={choice.look} />
                    <BlockFixturePreview
                        type={choice.type}
                        variant={choice.variant}
                        look={choice.look}
                    />
                </>
            ) : null}
        </div>
    );
}
