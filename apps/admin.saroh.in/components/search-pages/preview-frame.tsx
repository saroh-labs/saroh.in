"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The admin's own preview of a page, framed at a device's width: the desk
 * at 1440 scaled down to the column, the phone at 390. The frame is as tall
 * as the page in it (same origin, so its height can be read), so the
 * console's page scrolls, not the frame.
 */
export function PreviewFrame({
    src,
    width,
    title,
    caption,
}: {
    src: string;
    width: number;
    title: string;
    /** The bar's left words: "saroh.in/for/x · preview, not public". */
    caption: string;
}) {
    const box = useRef<HTMLDivElement>(null);
    const frame = useRef<HTMLIFrameElement>(null);
    const [scale, setScale] = useState(1);
    const [height, setHeight] = useState(1200);

    useEffect(() => {
        const el = box.current;
        if (!el) return;
        const fit = () => setScale(Math.min(1, el.clientWidth / width));
        fit();
        const ro = new ResizeObserver(fit);
        ro.observe(el);
        return () => ro.disconnect();
    }, [width]);

    // Follow the page's height as fonts land and questions open.
    const measure = () => {
        const doc = frame.current?.contentDocument;
        if (!doc) return;
        const read = () => setHeight(doc.documentElement.scrollHeight);
        read();
        new ResizeObserver(read).observe(doc.body);
    };

    return (
        <div className="overflow-hidden rounded-[11px] border bg-card">
            <div className="flex h-10 items-center gap-3 border-b px-3.5 text-xs text-muted-foreground">
                <span className="flex-1 truncate text-center font-mono">
                    {caption}
                </span>
                <span className="whitespace-nowrap tabular-nums">
                    {width} wide · {Math.round(scale * 100)}%
                </span>
            </div>
            <div
                ref={box}
                className="flex justify-center"
                style={{ height: height * scale }}
            >
                <iframe
                    ref={frame}
                    src={src}
                    title={title}
                    onLoad={measure}
                    scrolling="no"
                    style={{
                        width,
                        height,
                        border: 0,
                        flex: "none",
                        transform: `scale(${scale})`,
                        transformOrigin: "top center",
                    }}
                />
            </div>
        </div>
    );
}
