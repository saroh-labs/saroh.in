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
    const [height, setHeight] = useState(320);

    /**
     * Measure the rendered document once it has loaded.
     *
     * Same-origin, so the document is readable. Wrapped anyway: a frame that
     * fails to measure keeps its fallback height rather than collapsing to
     * nothing, which would look like the block rendered empty.
     */
    const measure = useCallback((frame: HTMLIFrameElement | null) => {
        if (!frame) return;
        const read = () => {
            try {
                const doc = frame.contentDocument;
                if (doc?.body) {
                    setHeight(
                        Math.max(120, Math.ceil(doc.body.scrollHeight) + 2),
                    );
                }
            } catch {
                // Cross-origin, or the document went away. Keep the fallback.
            }
        };
        frame.addEventListener("load", read);
        read();
    }, []);

    return (
        <div
            className="overflow-hidden"
            style={{ width: width * scale, height: height * scale }}
        >
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
