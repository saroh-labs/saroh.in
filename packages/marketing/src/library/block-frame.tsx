"use client";

import { useEffect, useRef, useState } from "react";

/** Height a frame stands at until its document is measured. */
const FALLBACK_HEIGHT = 480;
/** A very tall block is cropped, so one card never runs the length of the page. */
const MAX_HEIGHT = 1600;
/** What the preview route marks its page with; a 404 or an error page has none. */
export const PREVIEW_MARK = "data-library-preview";

/**
 * One block preview in its own document (the ui.saroh.in pattern): an
 * iframe at the real width, desk or phone, scaled down to the card, because
 * the blocks' Tailwind breakpoints follow the viewport. Lazy, and until it
 * loads it says so; if the page in it isn't a preview (a 404, an error) it
 * names the block and says the preview could not load, never a blank frame.
 * Same-origin, so its height is read from its document and followed.
 */
export function BlockFrame({
    src,
    width,
    title,
    name,
    loading,
    failed,
}: {
    /** Null until the toolbar has read the address. */
    src: string | null;
    /** The frame's real viewport width in px. */
    width: number;
    /** The iframe's accessible name: the block and its layout. */
    title: string;
    name: string;
    loading: string;
    failed: string;
}) {
    const box = useRef<HTMLDivElement>(null);
    const [boxWidth, setBoxWidth] = useState(0);
    const [height, setHeight] = useState(FALLBACK_HEIGHT);
    // What the last load of which address found: a new address is loading.
    const [result, setResult] = useState<{ src: string; ok: boolean } | null>(
        null,
    );
    const state =
        result?.src !== src ? "loading" : result.ok ? "ready" : "failed";

    useEffect(() => {
        const el = box.current;
        if (!el || typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(([entry]) =>
            setBoxWidth(entry.contentRect.width),
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    const scale = boxWidth > 0 ? Math.min(1, boxWidth / width) : 0;

    const onLoad = (frame: HTMLIFrameElement, loaded: string) => {
        const setState = (to: "ready" | "failed") =>
            setResult({ src: loaded, ok: to === "ready" });
        try {
            const doc = frame.contentDocument;
            const view = frame.contentWindow;
            if (!doc?.querySelector(`[${PREVIEW_MARK}]`) || !view) {
                setState("failed");
                return;
            }
            const measure = () =>
                setHeight(
                    Math.min(
                        MAX_HEIGHT,
                        Math.max(120, Math.ceil(doc.body.scrollHeight)),
                    ),
                );
            measure();
            // The blocks that read live data draw after the frame's own
            // load; follow the page as it grows. Gone with its document.
            const Observer = (
                view as Window & { ResizeObserver?: typeof ResizeObserver }
            ).ResizeObserver;
            if (Observer) new Observer(measure).observe(doc.body);
            setState("ready");
        } catch {
            setState("failed");
        }
    };

    return (
        <div
            ref={box}
            className="relative overflow-hidden rounded-xl border border-border bg-muted/40"
            style={{
                height: scale > 0 ? height * scale : FALLBACK_HEIGHT / 2,
            }}
        >
            {src && scale > 0 ? (
                <iframe
                    key={src}
                    src={src}
                    title={title}
                    loading="lazy"
                    width={width}
                    height={height}
                    onLoad={(e) => onLoad(e.currentTarget, src)}
                    className="absolute top-0 origin-top-left border-0"
                    style={{
                        left: Math.max(0, (boxWidth - width * scale) / 2),
                        transform: `scale(${scale})`,
                    }}
                />
            ) : null}
            {state === "ready" ? null : (
                <div className="absolute inset-0 grid place-items-center bg-muted/60 p-4 text-center">
                    {state === "failed" ? (
                        <p className="m-0 grid gap-1 text-[14px] text-foreground">
                            <span className="font-semibold">{name}</span>
                            <span className="text-muted-foreground">
                                {failed}
                            </span>
                        </p>
                    ) : (
                        <p className="m-0 text-[13px] font-semibold text-muted-foreground">
                            {loading}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
