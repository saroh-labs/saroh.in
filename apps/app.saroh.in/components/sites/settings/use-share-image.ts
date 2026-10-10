"use client";

import { useRef, useState } from "react";

import type { SiteDetail } from "@/lib/sites/service";

interface Facts {
    width: number | null;
    height: number | null;
    bytes: number | null;
}

const factsOf = (site: SiteDetail): Facts => ({
    width: site.socialImageWidth,
    height: site.socialImageHeight,
    bytes: site.socialImageBytes,
});

/**
 * The share image being chosen, with facts about it kept beside its
 * address (#220). A pick from the library brings them along; a pasted
 * address is measured in the browser, and its size on disk stays unknown.
 */
export function useShareImage(site: SiteDetail) {
    const [url, setUrl] = useState(site.socialImageUrl ?? "");
    const [facts, setFacts] = useState<Facts>(factsOf(site));
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

    function reset() {
        setUrl(site.socialImageUrl ?? "");
        measuring.current = null;
        setFacts(factsOf(site));
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

    return { url, facts, choose, reset, input };
}
