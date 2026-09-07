"use client";

import { useCallback, useState } from "react";

/**
 * One block preview, in its own document.
 *
 * An iframe rather than a div, because the blocks are responsive with Tailwind
 * breakpoints and those are VIEWPORT media queries. A 375px-wide div gets the
 * desk layout at 375px, which is not the phone case and would be a lie to
 * label as one.
 *
 * The frame is rendered at its true width and then scaled down to fit the
 * column, so a 1280px desk preview is legible beside a 375px phone one without
 * either being re-laid-out. `transform: scale` does not re-run media queries,
 * which is exactly the property wanted here: what is shown is the layout that
 * width really produces.
 *
 * Height comes from the content. A fixed height would either crop a tall block
 * or leave a gap under a short one, and the blocks differ by an order of
 * magnitude — a `cta` band is one row, a `booking` widget is a form and a
 * calendar.
 */
/**
 * Height a frame stands at until its document has been measured.
 *
 * Generous on purpose: too short looks like a broken block, and the frame grows
 * to fit the moment it loads.
 */
const FALLBACK_HEIGHT = 420;

export function PreviewFrame({
    src,
    width,
    title,
    scale = 1,
}: {
    src: string;
    /** The frame's real viewport width in px — what the block lays out against. */
    width: number;
    title: string;
    /** Display scale. 1 shows it at true size. */
    scale?: number;
}) {
    const [height, setHeight] = useState(FALLBACK_HEIGHT);
    const [loaded, setLoaded] = useState(false);

    /**
     * Measure the rendered document, once it actually has one.
     *
     * ONLY ON `load`, and that is the whole subtlety. An earlier version also
     * read immediately on ref attach, which measures `about:blank` — a couple
     * of dozen pixels — and writes that as the height. For a frame near the top
     * of the page the real `load` fired straight after and corrected it, so it
     * looked fine. For the frames further down it never fired, because they are
     * `loading="lazy"` and had not been scrolled to: those kept the
     * about:blank height and rendered as thin empty boxes, which reads exactly
     * like the block failing to render.
     *
     * Same-origin, so the document is readable. Wrapped anyway: a frame that
     * cannot be measured keeps the fallback rather than collapsing to nothing.
     */
    const measure = useCallback((frame: HTMLIFrameElement | null) => {
        if (!frame) return;
        const read = () => {
            try {
                const body = frame.contentDocument?.body;
                if (!body) return;
                const measured = Math.ceil(body.scrollHeight);
                // An empty or not-yet-painted document measures near zero. Keep
                // the fallback rather than believing it.
                if (measured > 40) setHeight(measured + 2);
                setLoaded(true);
            } catch {
                // Cross-origin, or the document went away. Keep the fallback.
            }
        };
        frame.addEventListener("load", read);
        // A frame restored from bfcache, or one already loaded before this ref
        // attached, has its document ready and will fire no further `load`.
        if (frame.contentDocument?.readyState === "complete") read();
    }, []);

    return (
        <div
            className="relative overflow-hidden"
            style={{ width: width * scale, height: height * scale }}
        >
            {/*
             * A frame that has not loaded yet is an empty white box with a
             * border, which reads as a block that failed to render rather than
             * one that has not been scrolled to. The frames are deliberately
             * lazy — a detail page carries up to eighteen of them — so "not
             * loaded" is a normal state and needs to look like one.
             */}
            {loaded ? null : (
                <div className="absolute inset-0 grid place-items-center bg-muted/40">
                    <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                        Loading preview
                    </span>
                </div>
            )}
            <iframe
                ref={measure}
                src={src}
                title={title}
                width={width}
                height={height}
                loading="lazy"
                className="border-0"
                style={{
                    transform: `scale(${scale})`,
                    transformOrigin: "top left",
                }}
            />
        </div>
    );
}
