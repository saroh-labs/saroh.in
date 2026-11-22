import type { RenderedHero } from "@saroh/block-contract";

import { siteImage } from "../lib/site-image";
import { cn } from "../lib/utils";
import { initialsOf } from "./look-front";

/**
 * The hero's Byline (BLOCK-MAP §3, the LA Hero board): who is behind the
 * business, under the line: a small round photo, the name and one line.
 * With no photo, their initials in a disc, never an empty frame.
 *
 * The photo is marked `data-site-photo="person"`, so the Images "Round"
 * component style reaches it (`component-theme.ts`). Drawn from `--site-*`
 * only; the words take the band's own colour (a Classic hero sits on
 * its hero band, a look's on the page). No `"use client"`.
 */
export function HeroByline({
    byline,
    className,
}: {
    byline: RenderedHero["byline"];
    className?: string;
}) {
    const name = byline?.name.trim();
    if (!byline || !name) return null;
    const photo = byline.image?.src.trim() ? byline.image : null;
    return (
        <div
            data-site-byline=""
            className={cn("flex items-center gap-3 text-left", className)}
        >
            {photo ? (
                <span data-site-photo="person" className="shrink-0">
                    <img
                        src={photo.src}
                        // The name is beside it: the photo says nothing more.
                        alt=""
                        width={44}
                        height={44}
                        {...siteImage("below", {
                            src: photo.src,
                            width: photo.width,
                            placeholder: photo.placeholder,
                            widths: photo.widths,
                            sizes: "44px",
                        })}
                        className="bg-site-surface block size-11 rounded-full object-cover"
                    />
                </span>
            ) : (
                <span
                    aria-hidden="true"
                    className="bg-site-surface text-site-fg font-site-heading inline-flex size-11 shrink-0 items-center justify-center rounded-full text-[15px] font-semibold"
                >
                    {initialsOf(name)}
                </span>
            )}
            <span className="min-w-0">
                <span className="block text-[15px] font-semibold leading-[1.3]">
                    {name}
                </span>
                {byline.role?.trim() ? (
                    <span className="block text-[14px] leading-[1.3] opacity-80">
                        {byline.role.trim()}
                    </span>
                ) : null}
            </span>
        </div>
    );
}
