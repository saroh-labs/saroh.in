"use client";

import { useCallback, useState } from "react";
import { createPortal } from "react-dom";

import { SiteTheme } from "@saroh/site-blocks";

/**
 * A block drawn at a real desk width inside its own document, scaled down to
 * fit a picker card (#267).
 *
 * AN IFRAME, for the reason the catalog's `PreviewFrame` gives: the blocks
 * respond to VIEWPORT media queries, so a desk-wide div inside a phone-width
 * editor would draw the phone layout stretched to desk width. A frame is its own
 * viewport. `transform: scale` does not re-run media queries, so the picture is
 * the layout that width really produces.
 *
 * NOT the catalog's component: that one loads a URL from ui.saroh.in, and an
 * app cannot import another app. This one renders the SAME React tree into the
 * frame through a portal, so it can wear this merchant's palette without a
 * route to carry it. The drawing itself is shared: callers pass
 * `BlockFixturePreview` from `@saroh/site-blocks`, which the catalog uses too.
 *
 * The frame is decoration. The card around it is the button; the frame takes
 * no pointer, focus or screen-reader attention (`inert`, `aria-hidden`).
 */
/**
 * 1024: the smallest width that still draws every block's desk layout (it is
 * Tailwind's `lg`), so a card-sized thumbnail stays as legible as it can.
 */
const FRAME_WIDTH = 1024;

/** Blank same-origin document to portal into. */
const BLANK = "<!DOCTYPE html><html><head></head><body></body></html>";

export function BlockThumbnail({
    variables,
    height = 168,
    children,
}: {
    /** This merchant's `--site-*` variables; absent → SiteTheme's defaults. */
    variables?: Record<string, string>;
    /** The card's visible height in px; the top of the block shows. */
    height?: number;
    children: React.ReactNode;
}) {
    const [doc, setDoc] = useState<Document | null>(null);
    const [scale, setScale] = useState(0.2);

    // Fit the desk-width frame to whatever width the card turns out to have.
    // React 19 runs a ref callback's returned cleanup when the node detaches.
    const measureBox = useCallback((box: HTMLDivElement | null) => {
        if (!box) return;
        const fit = () => setScale(box.clientWidth / FRAME_WIDTH);
        fit();
        const observer = new ResizeObserver(fit);
        observer.observe(box);
        return () => observer.disconnect();
    }, []);

    const attachFrame = useCallback((frame: HTMLIFrameElement | null) => {
        if (!frame) return;
        const ready = () => {
            const d = frame.contentDocument;
            if (!d?.body) return;
            /*
             * The frame starts with no styles. Copy this document's
             * stylesheets in, so the blocks' Tailwind classes and fonts mean
             * the same thing here as on the page around it.
             */
            document
                .querySelectorAll('link[rel="stylesheet"], style')
                .forEach((node) => d.head.appendChild(node.cloneNode(true)));
            d.documentElement.className = document.documentElement.className;
            d.body.className = document.body.className;
            d.body.style.margin = "0";
            setDoc(d);
        };
        frame.addEventListener("load", ready);
        if (frame.contentDocument?.readyState === "complete") ready();
        // Cleanup on detach, as in measureBox (React 19).
        return () => frame.removeEventListener("load", ready);
    }, []);

    return (
        <div
            ref={measureBox}
            aria-hidden="true"
            className="relative w-full overflow-hidden rounded-md border bg-muted/40"
            style={{ height }}
        >
            <iframe
                ref={attachFrame}
                srcDoc={BLANK}
                title=""
                tabIndex={-1}
                width={FRAME_WIDTH}
                height={Math.ceil(height / scale)}
                className="pointer-events-none absolute left-0 top-0 border-0"
                style={{
                    transform: `scale(${scale})`,
                    transformOrigin: "top left",
                }}
            />
            {doc
                ? createPortal(
                      <div
                          inert
                          className="min-h-screen bg-site-bg text-site-fg"
                      >
                          <SiteTheme variables={variables} />
                          {children}
                      </div>,
                      doc.body,
                  )
                : null}
        </div>
    );
}
