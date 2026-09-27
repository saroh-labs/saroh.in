import type { UIEvent } from "react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import type { Device, Zoom } from "@/components/sites/editor-constants";
import { DEVICE_PX } from "@/components/sites/editor-constants";
import {
    getChrome,
    getChromeOnServer,
    setChrome,
    setPlace,
    subscribe,
} from "@/lib/sites/editor-prefs";

/** The canvas padding (p-6 = 24px each side) is not usable width. */
export const CANVAS_PADDING = 48;
/** Narrow, the design pads the canvas 14px a side (G4). */
export const CANVAS_PADDING_NARROW = 28;

/**
 * How far "Fit" would scale a frame of this device into a canvas this wide.
 * Desktop has no fixed width, so it is never scaled.
 */
export function fitScaleFor(
    device: Device,
    canvasWidth: number,
    /** Preview draws the page edge to edge, with no padding (G5). */
    padding: number = CANVAS_PADDING,
): number {
    const frame = DEVICE_PX[device];
    return frame === null ? 1 : (canvasWidth - padding) / frame;
}

/*
 * Preview carried across a page switch (G5). The editor is keyed on its page,
 * so following a link in Preview remounts it; this says that the next mount of
 * that page starts in Preview. Memory only, so a reload starts in editing, and
 * cleared once read so coming back later does not.
 */
let carried: { siteId: string; pageId: string } | null = null;

/** Open the next mount of this page in Preview. */
export function carryPreview(siteId: string, pageId: string): void {
    carried = { siteId, pageId };
}

/*
 * "Fit" is the only value that is not a fixed percentage: it scales the
 * frame down until it fits the canvas, and never scales it UP — a phone
 * frame blown up to fill a desktop canvas would stop being a preview of a
 * phone.
 */
export function zoomScaleFor(zoom: Zoom, fitScale: number): number {
    return zoom === "fit" ? Math.min(1, fitScale) : zoom / 100;
}

/**
 * The editor's three columns: blocks, the page, the inspector (#340). The two
 * 1px tracks are the drag handles. Giving them real grid tracks — rather than
 * absolutely positioning them over a border — is what keeps the hit area and
 * the line the merchant is aiming at the same object.
 *
 * The canvas keeps a floor, so widening a side column can never squeeze the
 * page out of sight. Each side column is its chosen width, or its share of
 * what the window leaves after the canvas's floor — so a width chosen on a
 * wide screen never pushes the inspector off a narrower one (review of #345).
 */
export function editorColumns(railWidth: number, panelWidth: number): string {
    return `min(${railWidth}px, calc((100vw - 20rem - 2px) * ${(railWidth / (railWidth + panelWidth)).toFixed(4)})) 1px minmax(20rem,1fr) 1px min(${panelWidth}px, calc((100vw - 20rem - 2px) * ${(panelWidth / (railWidth + panelWidth)).toFixed(4)}))`;
}

/**
 * Narrow (G4), the inspector is a sheet over the page, so only the rail and
 * the page share the width. The rail keeps its chosen width up to 40% of the
 * window, and the page takes the rest.
 */
export function narrowColumns(railWidth: number): string {
    return `min(${railWidth}px, 40vw) 1px minmax(0,1fr)`;
}

/**
 * Everything about how the page is shown rather than what is on it: panel
 * widths, the device, zoom and Fit, Preview, and where the canvas was
 * scrolled to. Moved out of `site-editor.tsx` (#260).
 */
export function useEditorViewport({
    siteId,
    pageId,
    sectionCount,
    initialScrollTop,
    narrow = false,
}: {
    siteId: string;
    /** The open page, for Preview carried across a page switch. */
    pageId: string;
    /** The page's section count on load, which the place store is keyed by. */
    sectionCount: number;
    /** Where the canvas was scrolled to last time, restored on mount. */
    initialScrollTop: number;
    /** Below the desk width, where the canvas is padded less (G4). */
    narrow?: boolean;
}) {
    /*
     * Panel widths and device come from the preferences store rather than
     * component state: they belong to the browser, outlive this mount, and
     * the server has no business guessing them. `useSyncExternalStore`
     * renders the server snapshot (the defaults) during hydration and swaps to
     * the stored values before paint, so the markup matches what was sent and
     * nothing visibly jumps from 200px to whatever the merchant chose.
     */
    const chrome = useSyncExternalStore(
        subscribe,
        getChrome,
        getChromeOnServer,
    );
    const { railWidth, panelWidth, device } = chrome;

    // Writing through the store is what makes the choice survive a reload;
    // the re-render is the store's notification, not a second source of truth.
    const setRailWidth = (px: number) => setChrome({ railWidth: px });
    const setPanelWidth = (px: number) => setChrome({ panelWidth: px });
    // Relative steps read the store, not this render, so they accumulate.
    const nudgeRail = (d: number) =>
        setChrome({ railWidth: getChrome().railWidth + d });
    const nudgePanel = (d: number) =>
        setChrome({ panelWidth: getChrome().panelWidth + d });
    const setDevice = (next: Device) => {
        setChrome({ device: next });
        // The dip lasts as long as the width transition it accompanies.
        setSwitching(true);
        setTimeout(() => setSwitching(false), 300);
    };

    /*
     * "Zoom is the readout dropdown only — 50 / 75 / 100 / Fit. No ⌘scroll, no
     * pinch, no keyboard shortcuts." The spec resolved a contradiction by
     * making the readout the control, so there is deliberately no gesture here.
     */
    const [zoom, setZoom] = useState<Zoom>(100);
    /** Briefly dimmed while a device switch animates — the cross-fade. */
    const [switching, setSwitching] = useState(false);
    /*
     * Preview (G5): the same canvas with the editing tools taken away, so the
     * site can be used as a visitor would. Escape returns.
     */
    const [previewing, setPreviewing] = useState(
        () => carried?.siteId === siteId && carried.pageId === pageId,
    );
    useEffect(() => {
        carried = null;
    }, []);
    const canvasRef = useRef<HTMLDivElement | null>(null);

    const [fitScale, setFitScale] = useState(1);
    const zoomScale = zoomScaleFor(zoom, fitScale);
    useEffect(() => {
        const el = canvasRef.current;
        if (el === null) return;
        const measure = () => {
            setFitScale(
                fitScaleFor(
                    device,
                    el.clientWidth,
                    previewing
                        ? 0
                        : narrow
                          ? CANVAS_PADDING_NARROW
                          : CANVAS_PADDING,
                ),
            );
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, [device, previewing, narrow]);
    const scrollWrite = useRef<ReturnType<typeof setTimeout> | null>(null);

    /*
     * Restore where the merchant was scrolled to. Mount-only: re-running it on
     * a later change would yank the canvas back mid-scroll, and the stored
     * value is already being kept up to date by the handler below.
     */
    useEffect(() => {
        const el = canvasRef.current;
        if (el === null) return;
        el.scrollTop = initialScrollTop;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!previewing) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setPreviewing(false);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [previewing]);

    /*
     * Remembered per site — the spec lists preview scroll position among the
     * things that persist. Debounced: a scroll fires dozens of events a
     * second, and every one of them writing to storage would serialise the
     * whole place object each time for no benefit.
     */
    function onCanvasScroll(e: UIEvent<HTMLDivElement>) {
        const top = e.currentTarget.scrollTop;
        if (scrollWrite.current !== null) {
            clearTimeout(scrollWrite.current);
        }
        scrollWrite.current = setTimeout(() => {
            setPlace(siteId, sectionCount, { scrollTop: top });
        }, 250);
    }

    return {
        railWidth,
        panelWidth,
        device,
        setRailWidth,
        setPanelWidth,
        nudgeRail,
        nudgePanel,
        setDevice,
        zoom,
        setZoom,
        zoomScale,
        switching,
        previewing,
        setPreviewing,
        narrow,
        canvasRef,
        onCanvasScroll,
    };
}

export type EditorViewport = ReturnType<typeof useEditorViewport>;
