"use client";

import { inPageNavigation, mergeInPageNavigation } from "@saroh/block-contract";
import { Button } from "@saroh/ui/button";
import type { RefObject, UIEvent } from "react";
import { useEffect, useRef, useState } from "react";

import type { Device } from "@/components/sites/editor-constants";
import { DEVICE_WIDTH } from "@/components/sites/editor-constants";
import { DeviceFrame } from "@/components/sites/editor/device-frame";
import type {
    EditorInspectorTab,
    EditorRailTab,
    FixedPart,
} from "@/components/sites/editor/use-editor-selection";
import { useOpenPage } from "@/components/sites/editor/use-editor-selection";
import { unfinishedPhrase } from "@/components/sites/held-back-copy";
import type { HeldBackSection } from "@/components/sites/saveable-sections";
import {
    DraftPreview,
    FORM_NOT_SENT,
    FORM_NOT_SENT_DETAIL,
} from "@/components/sites/section-preview";
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
    footer,
    homeSections = [],
}: {
    /** The name as the inspector has it now (G6). */
    siteName: string;
    navigation: SiteNavigation | null;
    pages: SitePage[];
    /**
     * The footer to draw: the inspector's line as typed (G6), or the API's
     * sanitized copy when it is richer than a line (#336).
     */
    footer: SiteFooter | null;
    /**
     * The home page's sections, when it is the page open: each one with a
     * menu label leads the menu, as publish puts it (`withInPageNavigation`
     * in the API). On any other page the canvas has not read the home
     * page's sections, and draws the page entries alone.
     */
    homeSections?: Section[];
}): CanvasChrome {
    const pageEntries = (navigation?.items ?? []).flatMap((item) => {
        const page = pages.find((p) => p.id === item.pageId && !p.hidden);
        return page
            ? [{ label: item.label ?? page.title, href: page.path }]
            : [];
    });
    return {
        name: siteName,
        // A section entry a page entry already names is left out, as
        // publish leaves it out (`mergeInPageNavigation`).
        navigation: mergeInPageNavigation(
            inPageNavigation(homeSections.filter((s) => !s.hidden)),
            pageEntries,
        ),
        // Sanitizing can leave nothing, which is no footer — unless it is
        // laid out on the left, which keeps its row (the name).
        footer:
            footer?.value.trim() || footer?.layout === "left" ? footer : null,
    };
}

/** What Preview's bar says while nothing has been tried. */
const PREVIEW_NOTE =
    "This is your site with the draft. Try it; nothing is live until you publish.";

/**
 * The canvas: the page, drawn with the real site blocks, in a window whose
 * bar names its address. Moved out of `site-editor.tsx` (#260).
 *
 * Preview (G5) is this same canvas and the same renderer with the editing
 * tools taken away — no outlines, labels or pins, and no window bar — so
 * links and buttons work as a visitor's would. A link to one of the site's
 * pages opens it in the editor; any other opens in a new tab. The device and
 * zoom still apply. There is no second renderer to drift from this one.
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
    previewing,
    setPreviewing,
    narrow = false,
    siteId,
    pageId,
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
    dirty,
    onlyHeldBack,
    heldBack,
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
    /** Preview: the editing tools are away and the site is usable (G5). */
    previewing: boolean;
    setPreviewing: (on: boolean) => void;
    /** Below the desk width: the design's tighter padding (G4). */
    narrow?: boolean;
    /** For the blocks that read live data on the canvas (G8). */
    siteId: string;
    /** The open page, so a link to it in Preview stays here. */
    pageId: string;
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
    /**
     * Work not yet saved — the page, the look, the name or the footer —
     * which holds a page switch back (review G-3).
     */
    dirty: boolean;
    onlyHeldBack: boolean;
    heldBack: HeldBackSection[];
}) {
    const openPage = useOpenPage({
        siteId,
        pageId,
        dirty,
        unfinished: onlyHeldBack ? unfinishedPhrase(heldBack) : undefined,
        onSamePage: () => {
            const el = canvasRef.current;
            if (el) el.scrollTop = 0;
        },
    });

    /*
     * A form tried in Preview says, in the bar, that it went nowhere: a toast
     * would land on top of the bar. It goes back to the note after a while.
     */
    const [notSent, setNotSent] = useState(false);
    const notSentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(
        () => () => {
            if (notSentTimer.current !== null) {
                clearTimeout(notSentTimer.current);
            }
        },
        [],
    );
    function formBlocked() {
        setNotSent(true);
        if (notSentTimer.current !== null) clearTimeout(notSentTimer.current);
        notSentTimer.current = setTimeout(() => setNotSent(false), 5000);
    }

    const page = (
        <DraftPreview
            siteId={siteId}
            siteAddress={address}
            sections={sections}
            pages={pages}
            page={pages.find((p) => p.id === pageId) ?? null}
            style={style}
            styleOptions={styleOptions}
            chrome={canvasChrome}
            {...(previewing
                ? {
                      onOpenPage: openPage,
                      onFormBlocked: formBlocked,
                  }
                : {
                      selectedIndex,
                      onSelect: (index: number) => {
                          setRail("sections");
                          setSelectedIndex(index);
                      },
                      selectedChrome,
                      onSelectChrome: selectChrome,
                      notesByKey,
                      onOpenNotes: (index: number) => {
                          setSelectedIndex(index);
                          setInspector("feedback");
                      },
                  })}
        />
    );

    return (
        <div
            ref={canvasRef}
            onScroll={onCanvasScroll}
            data-previewing={previewing || undefined}
            className={`min-h-0 overflow-y-auto bg-background ${previewing ? "p-0" : narrow ? "px-3.5 py-[18px]" : "p-6"}`}
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
             * once, and it never reappears afterwards. Preview's bar says
             * the same while it is open.
             */}
            {neverPublished && !previewing ? (
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
                 * where a customer would find it. Preview drops the
                 * window: it is the site, edge to edge (G5).
                 */}
                <div
                    className={
                        previewing
                            ? "overflow-hidden"
                            : "overflow-hidden rounded-lg border shadow-xl shadow-black/10 dark:shadow-black/40"
                    }
                >
                    {previewing ? null : (
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
                    )}
                    {/*
                     * One renderer either way. Preview only leaves out
                     * what makes the page editable: selecting, the lock
                     * on the header and footer, and the notes' pins.
                     *
                     * At phone or tablet width it is drawn in a frame of
                     * its own (`DeviceFrame`), so the blocks' breakpoints
                     * read the device's width, not the editor window's.
                     */}
                    {device === "desktop" ? (
                        page
                    ) : (
                        <DeviceFrame title={`The page at ${device} width`}>
                            {page}
                        </DeviceFrame>
                    )}
                </div>
            </div>

            {previewing ? (
                <PreviewBar
                    notSent={notSent}
                    onBack={() => setPreviewing(false)}
                />
            ) : null}
        </div>
    );
}

/**
 * Preview's way out, pinned to the window rather than the page: on a long
 * page an exit that scrolled away with the content would leave a mode with
 * no visible way back. It says what Preview is, or that a form went nowhere.
 */
function PreviewBar({
    notSent,
    onBack,
}: {
    notSent: boolean;
    onBack: () => void;
}) {
    return (
        <div className="fixed bottom-[22px] left-1/2 z-40 flex max-w-[92vw] -translate-x-1/2 flex-wrap items-center gap-[13px] rounded-full bg-brand-surface px-3.5 py-2.5 shadow-xl shadow-black/30">
            <span
                role="status"
                className="text-[0.78125rem] text-brand-surface-foreground/85"
            >
                {notSent
                    ? `${FORM_NOT_SENT}. ${FORM_NOT_SENT_DETAIL}`
                    : PREVIEW_NOTE}
            </span>
            <button
                type="button"
                onClick={onBack}
                className="flex shrink-0 items-center gap-2 rounded text-[0.78125rem] font-semibold text-highlight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                Back to editing
                <kbd className="rounded border border-brand-surface-foreground/30 px-[5px] py-px font-mono text-[0.6875rem] font-normal text-brand-surface-foreground/75">
                    Esc
                </kbd>
            </button>
        </div>
    );
}
