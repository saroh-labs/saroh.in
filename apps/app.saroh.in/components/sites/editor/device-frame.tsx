"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * The page at a device's width, in a document of its own.
 *
 * The site blocks lay themselves out with viewport breakpoints (`sm:`,
 * `lg:`), which is right on a visitor's phone. On the canvas, a Phone or
 * Tablet frame was only a narrower `div` in a desktop-wide window, so every
 * breakpoint still read the window: a three-across testimonials grid drew its
 * three cards inside 375px, one word to a line, and features, galleries and
 * contact did the same. In an iframe the viewport IS the frame, so each block
 * reflows exactly as it will on the device.
 *
 * Same origin and no `src`, so the page is rendered into it with a portal:
 * one React tree, one renderer, selection and Preview's links unchanged.
 * What the frame has to carry across from the editor's own document:
 *
 * - the stylesheets, copied from `<head>` and copied again whenever Next adds
 *   one (a route's CSS arrives after the first paint);
 * - the classes on `<html>` and `<body>`, which hold the fonts' variables and
 *   the theme;
 * - key presses, re-sent to the editor's window, so Esc leaves Preview and
 *   the editor's shortcuts work after a click inside the page.
 *
 * It is as tall as the page inside it: the canvas around it does the
 * scrolling, as it does for the desktop frame.
 */
export function DeviceFrame({
    title,
    children,
}: {
    /** Names the frame for a screen reader, e.g. "The page at phone width". */
    title: string;
    children: ReactNode;
}) {
    /*
     * The frame's document, taken when the frame is attached and again on
     * its load: Firefox can swap an iframe's first blank document for a new
     * one, and a portal into the first would then draw nothing.
     */
    const [doc, setDoc] = useState<Document | null>(null);
    const [height, setHeight] = useState(0);
    const attach = (frame: HTMLIFrameElement | null) => {
        const next = frame?.contentDocument ?? null;
        if (next !== doc) setDoc(next);
    };

    useEffect(() => {
        const view = doc?.defaultView;
        if (!doc || !view) return;

        const mirrorHead = () => copyStyles(doc);
        const mirrorClasses = () => copyRootClasses(doc);
        mirrorHead();
        mirrorClasses();
        const headWatch = new MutationObserver(mirrorHead);
        headWatch.observe(document.head, { childList: true });
        const classWatch = new MutationObserver(mirrorClasses);
        classWatch.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class", "style"],
        });

        // Typing in a form on the page (Preview) stays in the page: only Esc
        // leaves a field for the editor, so Undo never fires mid-word.
        const forwardKey = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            const typing =
                target !== null &&
                (target.isContentEditable ||
                    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
            if (typing && e.key !== "Escape") return;
            window.dispatchEvent(new KeyboardEvent("keydown", e));
        };
        view.addEventListener("keydown", forwardKey);

        const measure = () => setHeight(doc.body.scrollHeight);
        const sizeWatch = new ResizeObserver(measure);
        sizeWatch.observe(doc.body);

        return () => {
            headWatch.disconnect();
            classWatch.disconnect();
            sizeWatch.disconnect();
            view.removeEventListener("keydown", forwardKey);
        };
    }, [doc]);

    return (
        <iframe
            ref={attach}
            onLoad={(e) => attach(e.currentTarget)}
            title={title}
            data-device-frame=""
            className="block w-full border-0 bg-transparent"
            style={{ height }}
        >
            {doc?.body ? createPortal(children, doc.body) : null}
        </iframe>
    );
}

/** The editor's stylesheets, copied into the frame (again, replacing). */
function copyStyles(target: Document) {
    target.head
        .querySelectorAll("[data-editor-mirrored]")
        .forEach((node) => node.remove());
    document.head
        .querySelectorAll('style, link[rel="stylesheet"]')
        .forEach((node) => {
            const copy = node.cloneNode(true) as HTMLElement;
            copy.setAttribute("data-editor-mirrored", "");
            target.head.appendChild(copy);
        });
}

/** The fonts' variables and the theme, which live on `<html>` and `<body>`. */
function copyRootClasses(target: Document) {
    target.documentElement.className = document.documentElement.className;
    target.documentElement.style.cssText =
        document.documentElement.style.cssText;
    target.body.className = document.body.className;
    target.body.style.margin = "0";
}

/**
 * The first element matching `selector` on the canvas, looking inside a
 * device frame too: a block drawn at phone or tablet width lives in the
 * frame's document, not the canvas's.
 */
export function queryCanvas<T extends Element>(
    canvas: HTMLElement,
    selector: string,
): T | null {
    const here = canvas.querySelector<T>(selector);
    if (here) return here;
    const inner = canvas.querySelector<HTMLIFrameElement>(
        "iframe[data-device-frame]",
    )?.contentDocument;
    return inner?.querySelector<T>(selector) ?? null;
}
