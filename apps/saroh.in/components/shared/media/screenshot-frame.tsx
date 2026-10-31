import { cn } from "@/lib/cn";

import type { ShotKey } from "@/content/shots";
import { shots } from "@/content/shots";

import { ShotImage } from "./shot-image";
import { ZoomableShot } from "./zoomable-shot";

/**
 * A product screenshot in the designs' frame: white, a hairline border and a
 * soft shadow.
 *
 * - `shot` (default) — 14px corners, the step and segment shots.
 * - `hero` — 18px corners and the deeper shadow (a feature page's hero).
 * - `home` — 16px corners and the deeper shadow (Home's hero).
 *
 * `zoomable` makes the image a button that opens the lightbox ("Click to
 * enlarge"); focus returns to it when the lightbox closes. Drawn on the
 * server, so the browser gets this one shot, never the whole manifest.
 */
export function ScreenshotFrame({
    shot,
    alt,
    variant = "shot",
    zoomable = false,
    priority = false,
    priorityFrom,
    sizes = "(min-width: 1280px) 760px, 100vw",
    className,
}: {
    shot: ShotKey;
    /** This place's caption; defaults to the manifest's. */
    alt?: string;
    variant?: "shot" | "hero" | "home";
    zoomable?: boolean;
    priority?: boolean;
    /** `ShotImage`'s: high priority only where this media query matches. */
    priorityFrom?: string;
    sizes?: string;
    className?: string;
}) {
    const entry = shots[shot];
    const text = alt ?? entry.alt;
    const image = (
        <ShotImage
            shot={entry}
            alt={text}
            sizes={sizes}
            priority={priority}
            priorityFrom={priorityFrom}
        />
    );
    return (
        <div
            data-shot={shot}
            className={cn(
                "min-w-0 overflow-hidden border border-border bg-card",
                variant === "shot" && "rounded-xl shadow-mk-shot",
                variant === "hero" && "rounded-2xl shadow-mk-hero",
                variant === "home" && "rounded-mk-card shadow-mk-hero",
                className,
            )}
        >
            {zoomable ? (
                <ZoomableShot shot={entry} alt={text}>
                    {image}
                </ZoomableShot>
            ) : (
                image
            )}
        </div>
    );
}
