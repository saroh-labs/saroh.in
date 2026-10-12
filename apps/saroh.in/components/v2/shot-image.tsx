import { preload } from "react-dom";

import type { Shot } from "@/content/shots";
import { cn } from "@/lib/cn";
import { shotSources } from "@/lib/shot-sources";

/**
 * One screenshot from the manifest, or — until the capture pipeline (U20) has
 * shot it — a neutral frame of the same shape, so the page's layout already
 * matches the design. The placeholder keeps the alt as its accessible name.
 *
 * The picture is a plain `<img>` over files (`lib/shot-sources.ts`): the
 * capture and its smaller copies in a `srcset`, with `sizes` saying how wide
 * this place draws it. `width` and `height` hold its space before it
 * arrives. A `priority` shot (a page's hero, its largest thing on screen)
 * is fetched at once and preloaded from the document's head; every other
 * one waits until it is near the screen. Not `next/image`: on Cloudflare its
 * `/_next/image` re-encodes on every request and sends nothing a browser
 * may keep.
 */
export function ShotImage({
    shot,
    alt,
    sizes,
    priority = false,
    className,
}: {
    shot: Shot;
    alt: string;
    sizes: string;
    priority?: boolean;
    className?: string;
}) {
    if (shot.src === null) {
        return (
            <span
                role="img"
                aria-label={alt}
                style={{ aspectRatio: `${shot.width} / ${shot.height}` }}
                className={cn(
                    "grid w-full min-w-[min(100%,320px)] place-items-center bg-muted",
                    className,
                )}
            />
        );
    }
    const { src, srcSet } = shotSources({ src: shot.src, width: shot.width });
    if (priority) {
        preload(src, {
            as: "image",
            imageSrcSet: srcSet,
            imageSizes: srcSet ? sizes : undefined,
            fetchPriority: "high",
        });
    }
    return (
        // eslint-disable-next-line @next/next/no-img-element -- files with their own srcset (lib/shot-sources.ts); next/image's optimizer is what this replaces
        <img
            // `sizes` and `srcSet` before `src`: a browser that reads `src`
            // first starts on the full-size capture.
            sizes={srcSet ? sizes : undefined}
            srcSet={srcSet}
            src={src}
            alt={alt}
            width={shot.width}
            height={shot.height}
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : undefined}
            decoding="async"
            className={cn("block h-auto w-full", className)}
        />
    );
}
