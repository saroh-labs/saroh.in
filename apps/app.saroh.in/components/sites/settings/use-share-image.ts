"use client";

import { useRef, useState } from "react";

import type { SiteDetail } from "@/lib/sites/service";

interface Facts {
    width: number | null;
    height: number | null;
    bytes: number | null;
}

/** A share image as it is saved: its address, and what is known of it. */
export interface ShareImage {
    url: string;
    facts: Facts;
}

export const shareImageOf = (site: SiteDetail): ShareImage => ({
    url: site.socialImageUrl ?? "",
    facts: {
        width: site.socialImageWidth,
        height: site.socialImageHeight,
        bytes: site.socialImageBytes,
    },
});

/**
 * The share image being chosen in its sheet, starting from the one saved,
 * with facts about it kept beside its address (#220). A pick from the library brings them along; a pasted
 * address is measured in the browser, and its size on disk stays unknown.
 */
export function useShareImage(saved: ShareImage) {
    const [url, setUrl] = useState(saved.url);
    const [facts, setFacts] = useState<Facts>(saved.facts);
    // The address whose measurement is still in flight, so a slow picture
    // that finishes after the merchant has moved on cannot stamp its size on
    // the next one. Touched only from event handlers, never during render.
    const measuring = useRef<string | null>(null);

    function choose(
        src: string,
        picked?: { width?: number; height?: number; bytes?: number },
    ) {
        setUrl(src);
        measuring.current = null;
        if (picked) {
            setFacts({
                width: picked.width ?? null,
                height: picked.height ?? null,
                bytes: picked.bytes ?? null,
            });
            return;
        }
        setFacts({ width: null, height: null, bytes: null });
        if (!src.trim()) return;
        // Cross-origin pictures still report their natural size; a URL that
        // never loads leaves the facts unknown.
        measuring.current = src;
        const img = new Image();
        img.onload = () => {
            if (measuring.current !== src) return;
            setFacts((f) => ({
                ...f,
                width: img.naturalWidth,
                height: img.naturalHeight,
            }));
        };
        img.src = src;
    }

    /** What Save sends: the image and its facts, or all four cleared. */
    const input = url
        ? {
              socialImageUrl: url,
              socialImageWidth: facts.width,
              socialImageHeight: facts.height,
              socialImageBytes: facts.bytes,
          }
        : {
              socialImageUrl: null,
              socialImageWidth: null,
              socialImageHeight: null,
              socialImageBytes: null,
          };

    return { url, facts, choose, input };
}
