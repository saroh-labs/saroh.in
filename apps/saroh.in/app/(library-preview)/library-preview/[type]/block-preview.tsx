"use client";

import { useEffect, useState } from "react";

import { componentStyleVariables } from "@saroh/block-contract";
import {
    PREVIEW_MARK,
    TRY_MESSAGE,
} from "@saroh/marketing/library/block-frame";
import { BlockFixturePreview, SiteHeader, SiteTheme } from "@saroh/site-blocks";

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
 *
 * The library's Try panel (U12) sends a business name and town by message
 * from the page that framed it, never in this page's address: with a name,
 * the block sits under that business's own header, with its town.
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
    const [tried, setTried] = useState({ name: "", town: "" });
    useEffect(() => {
        const take = (e: MessageEvent) => {
            const data = e.data as {
                kind?: unknown;
                name?: unknown;
                town?: unknown;
            } | null;
            if (
                e.origin !== window.location.origin ||
                e.source !== window.parent ||
                data?.kind !== TRY_MESSAGE
            )
                return;
            const text = (v: unknown, max: number) =>
                typeof v === "string" ? v.trim().slice(0, max) : "";
            setTried({ name: text(data.name, 120), town: text(data.town, 80) });
        };
        window.addEventListener("message", take);
        // Opened after the panel was typed in: ask for what it holds.
        if (window.parent !== window)
            window.parent.postMessage(
                { kind: TRY_MESSAGE },
                window.location.origin,
            );
        return () => window.removeEventListener("message", take);
    }, []);
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
                    {tried.name ? (
                        <>
                            <SiteHeader
                                name={tried.name}
                                navigation={[]}
                                look={choice.look}
                            />
                            {tried.town ? (
                                <p className="text-site-muted m-0 px-4 py-2 text-center text-sm">
                                    {tried.town}
                                </p>
                            ) : null}
                        </>
                    ) : null}
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
