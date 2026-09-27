"use client";

import { Button } from "@saroh/ui/button";
import type { RefObject, UIEvent } from "react";

import type { Device } from "@/components/sites/editor-constants";
import { DEVICE_WIDTH } from "@/components/sites/editor-constants";
import type {
    EditorInspectorTab,
    EditorRailTab,
    FixedPart,
} from "@/components/sites/editor/use-editor-selection";
import { DraftPreview } from "@/components/sites/section-preview";
import type {
    Section,
    SiteFooter,
    SiteNavigation,
    SitePage,
} from "@/lib/sites/service";
import type { SiteStyle, SiteStyleOptions } from "@/lib/sites/style";

/** What the canvas draws around the blocks: the site's header and footer. */
export interface CanvasChrome {
    name: string;
    navigation: { label: string; href: string }[];
    footer: SiteFooter | null;
}

/*
 * The header the canvas draws, with the menu resolved the way publish
 * resolves it: over the pages that will be written, so an entry for a
 * hidden page is absent here exactly as it will be on the live site.
 */
export function canvasChromeFor({
    siteName,
    navigation,
    pages,
    footerPreview,
}: {
    siteName: string;
    navigation: SiteNavigation | null;
    pages: SitePage[];
    footerPreview: SiteFooter | null;
}): CanvasChrome {
    return {
        name: siteName,
        navigation: (navigation?.items ?? []).flatMap((item) => {
            const page = pages.find((p) => p.id === item.pageId && !p.hidden);
            return page
                ? [{ label: item.label ?? page.title, href: page.path }]
                : [];
        }),
        // Sanitizing can leave nothing; nothing is no footer.
        footer: footerPreview?.value.trim() ? footerPreview : null,
    };
}

/**
 * The canvas: the page, drawn with the real site blocks, in a window whose
 * bar names its address. Moved out of `site-editor.tsx` unchanged (#260).
 *
 * Preview — width changes, data does not.
 *
 * The canvas ground is the SAME #0b0b0b as the chrome (spec §7), not a
 * lighter tray. A raised panel here would make the canvas a second bright
 * object competing with the one that matters: the rendered site.
 */
export function EditorCanvas({
    canvasRef,
    onCanvasScroll,
    conflict,
    neverPublished,
    device,
    switching,
    zoomScale,
    siteId,
    address,
    sections,
    pages,
    style,
    styleOptions,
    selectedIndex,
    setSelectedIndex,
    setRail,
    setInspector,
    canvasChrome,
    selectedChrome,
    selectChrome,
    notesByKey,
}: {
    canvasRef: RefObject<HTMLDivElement | null>;
    onCanvasScroll: (e: UIEvent<HTMLDivElement>) => void;
    /** Someone else saved this page while this editor was open (#285). */
    conflict: boolean;
    neverPublished: boolean;
    device: Device;
    /** Briefly dimmed while a device switch animates. */
    switching: boolean;
    zoomScale: number;
    /** For the blocks that read live data on the canvas (G8). */
    siteId: string;
    address?: string | null;
    sections: Section[];
    pages: SitePage[];
    style: SiteStyle;
    styleOptions: SiteStyleOptions;
    selectedIndex: number | null;
    setSelectedIndex: (index: number | null) => void;
    setRail: (next: EditorRailTab) => void;
    setInspector: (next: EditorInspectorTab) => void;
    canvasChrome: CanvasChrome;
    selectedChrome: FixedPart | null;
    selectChrome: (part: FixedPart) => void;
    notesByKey: Map<string, number>;
}) {
    return (
        <div
            ref={canvasRef}
            onScroll={onCanvasScroll}
            className="min-h-0 overflow-y-auto bg-background p-6"
        >
            {/*
             * Someone else saved this page while this editor was open
             * (#285). Loud, because everything typed since is now
             * unsaveable — and the merchant has to choose what happens
             * to it. Reloading takes the other version and drops this
             * one, so it is offered, never done automatically.
             */}
            {conflict ? (
                <div
                    role="alert"
                    className="mx-auto mb-4 max-w-xl rounded-lg border border-destructive/30 bg-destructive-subtle p-4 text-sm"
                >
                    <p className="font-medium">
                        Someone else saved this page while you were editing.
                    </p>
                    <p className="mt-1 text-muted-foreground">
                        Nothing you have written has been lost, and nothing more
                        will save until you reload. Reloading shows their
                        version and discards yours, so copy anything you want to
                        keep first.
                    </p>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="mt-3"
                        onClick={() => window.location.reload()}
                    >
                        Reload the latest
                    </Button>
                </div>
            ) : null}

            {/*
             * The first-run nudge (spec §5), in the spec's own words.
             * "It does not nag" — so it is one quiet line above the
             * preview, shown only until the site has been published
             * once, and it never reappears afterwards.
             */}
            {neverPublished ? (
                <p
                    className="mx-auto mb-4 text-center text-xs text-muted-foreground"
                    style={{ maxWidth: DEVICE_WIDTH[device] }}
                >
                    Nothing&rsquo;s live yet — publish when you&rsquo;re ready,
                    nobody can see this in the meantime.
                </p>
            ) : null}
            <div
                /*
                 * "Switching frames cross-fades and resizes — the frame
                 * animates to the new width, content reflows during
                 * it." The width transition does the resize; the brief
                 * dip in opacity is the cross-fade, and it is what stops
                 * a reflow mid-animation reading as a glitch.
                 *
                 * This animates `max-width`, which is a LAYOUT property
                 * and so breaks the usual transform/opacity-only rule,
                 * deliberately. The whole point of a device preview is
                 * showing how the site reflows at that width; a
                 * transform would scale the content instead of
                 * reflowing it, which is the one thing this control
                 * exists to show. So the reflow is the work, not an
                 * accident of implementation.
                 *
                 * What that buys is a duty to keep it short: 200ms
                 * rather than the 300 it was, because every frame here
                 * costs a layout pass over the whole rendered site.
                 */
                className={`mx-auto transition-[max-width,opacity,transform] duration-slow ease-out motion-reduce:transition-none ${
                    switching ? "opacity-70" : "opacity-100"
                }`}
                style={{
                    maxWidth: DEVICE_WIDTH[device],
                    transform: `scale(${zoomScale})`,
                    transformOrigin: "top center",
                }}
            >
                {/*
                 * The page sits in a window whose bar names the
                 * address it lives at (#340): this is the merchant's
                 * website, not a mock-up of one, and the bar says
                 * where a customer would find it.
                 */}
                <div className="overflow-hidden rounded-lg border shadow-xl shadow-black/10 dark:shadow-black/40">
                    <div className="flex h-9 items-center gap-3 border-b bg-muted px-3">
                        <span aria-hidden="true" className="flex gap-1.5">
                            <span className="size-2 rounded-full bg-foreground/15" />
                            <span className="size-2 rounded-full bg-foreground/15" />
                            <span className="size-2 rounded-full bg-foreground/15" />
                        </span>
                        <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                            {address ? `${address}/` : "Not published yet"}
                        </span>
                        {address ? (
                            <span className="ml-auto hidden shrink-0 text-[0.6875rem] text-muted-foreground xl:inline">
                                ⌘-click a link to open it on your site
                            </span>
                        ) : null}
                    </div>
                    <DraftPreview
                        siteId={siteId}
                        siteAddress={address}
                        sections={sections}
                        pages={pages}
                        style={style}
                        styleOptions={styleOptions}
                        selectedIndex={selectedIndex}
                        onSelect={(index) => {
                            setRail("sections");
                            setSelectedIndex(index);
                        }}
                        chrome={canvasChrome}
                        selectedChrome={selectedChrome}
                        onSelectChrome={selectChrome}
                        notesByKey={notesByKey}
                        onOpenNotes={(index) => {
                            setSelectedIndex(index);
                            setInspector("feedback");
                        }}
                    />
                </div>
            </div>
        </div>
    );
}

/**
 * Full-screen preview: "hides everything; Escape returns". The frame keeps
 * its device width, so this is the site at the size being designed for with
 * nothing else on screen — not a maximised editor.
 */
export function FullScreenPreview({
    setFullScreen,
    device,
    siteId,
    address,
    sections,
    pages,
    style,
    styleOptions,
    canvasChrome,
}: {
    setFullScreen: (open: boolean) => void;
    device: Device;
    siteId: string;
    address?: string | null;
    sections: Section[];
    pages: SitePage[];
    style: SiteStyle;
    styleOptions: SiteStyleOptions;
    canvasChrome: CanvasChrome;
}) {
    return (
        <div className="fixed inset-0 z-40 overflow-y-auto bg-background p-6">
            <button
                type="button"
                onClick={() => setFullScreen(false)}
                className="fixed right-4 top-4 z-10 rounded border bg-background/80 px-2 py-1 text-xs text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
            >
                Escape to return
            </button>
            <div
                className="mx-auto transition-[max-width] duration-slow ease-out motion-reduce:transition-none"
                style={{ maxWidth: DEVICE_WIDTH[device] }}
            >
                <DraftPreview
                    siteId={siteId}
                    siteAddress={address}
                    sections={sections}
                    pages={pages}
                    style={style}
                    styleOptions={styleOptions}
                    chrome={canvasChrome}
                />
            </div>
        </div>
    );
}
