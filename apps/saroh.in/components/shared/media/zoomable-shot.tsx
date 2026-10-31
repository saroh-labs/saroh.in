"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { useState } from "react";

import type { Shot } from "@/content/shots";
import { ring } from "@/lib/ring";

/** Fetched on the first click: most visits never enlarge a screenshot. */
const Lightbox = dynamic(() => import("./lightbox").then((m) => m.Lightbox), {
    ssr: false,
});

/**
 * A screenshot as a button that opens it enlarged ("Click to enlarge");
 * focus returns to it when the lightbox closes. `children` is the image,
 * drawn on the server.
 */
export function ZoomableShot({
    shot,
    alt,
    children,
}: {
    shot: Shot;
    alt: string;
    children: ReactNode;
}) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button
                type="button"
                title="Click to enlarge"
                onClick={() => setOpen(true)}
                className={`block w-full cursor-zoom-in ${ring({ offset: "inset" })}`}
            >
                {children}
            </button>
            {open ? (
                <Lightbox
                    shot={shot}
                    alt={alt}
                    onClose={() => setOpen(false)}
                />
            ) : null}
        </>
    );
}
