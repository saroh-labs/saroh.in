"use client";

import { cn } from "@/lib/cn";
import { useState } from "react";

import type { ShotKey } from "@/content/shots";
import { shots } from "@/content/shots";

import { Lightbox } from "./lightbox";
import { ShotImage } from "./shot-image";

/**
 * A product screenshot in the designs' frame: white, a hairline border and a
 * soft shadow.
 *
 * - `shot` (default) — 14px corners, the step and segment shots.
 * - `hero` — 18px corners and the deeper shadow (a feature page's hero).
 * - `home` — 16px corners and the deeper shadow (Home's hero).
 *
 * `zoomable` makes the image a button that opens the lightbox ("Click to
 * enlarge"); focus returns to it when the lightbox closes.
 */
export function ScreenshotFrame({
    shot,
    alt,
    variant = "shot",
    zoomable = false,
    priority = false,
    sizes = "(min-width: 1280px) 760px, 100vw",
    className,
}: {
    shot: ShotKey;
    /** This place's caption; defaults to the manifest's. */
    alt?: string;
    variant?: "shot" | "hero" | "home";
    zoomable?: boolean;
    priority?: boolean;
    sizes?: string;
    className?: string;
}) {
    const [open, setOpen] = useState(false);
    const entry = shots[shot];
    const text = alt ?? entry.alt;
    const image = (
        <ShotImage shot={entry} alt={text} sizes={sizes} priority={priority} />
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
                <>
                    <button
                        type="button"
                        title="Click to enlarge"
                        onClick={() => setOpen(true)}
                        className="block w-full cursor-zoom-in focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid]"
                    >
                        {image}
                    </button>
                    {open ? (
                        <Lightbox
                            shot={entry}
                            alt={text}
                            onClose={() => setOpen(false)}
                        />
                    ) : null}
                </>
            ) : (
                image
            )}
        </div>
    );
}
