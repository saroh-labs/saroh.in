import { cn } from "@saroh/marketing/cn";
import { DRAWN_PHOTOS } from "@saroh/marketing/kit/drawn-photo";
import type { CSSProperties } from "react";

/**
 * The Reach boards' stand-in product photos (FW, FS), from the kit's
 * `drawn-photo`: drawn bakes, not
 * pictures of a real shop, so a drawing never passes for a capture. Each is
 * a fill only: the caller sizes it and gives it its corners. Keyed by what
 * it shows, so any world's item can name one (`photoFor`).
 */
const PHOTOS = DRAWN_PHOTOS;

export type PhotoKind = keyof typeof PHOTOS;

/** The drawn photo for an item the world names; bakes look like bakes. */
export const photoFor = (itemKey: string): PhotoKind =>
    (
        ({
            "bun-box": "buns",
            sourdough: "loaf",
            "brownie-box": "brownies",
            "rose-pistachio": "brownies",
            "black-forest": "brownies",
            "plum-cake": "festive",
            hamper: "festive",
        }) as Record<string, PhotoKind>
    )[itemKey] ?? "buns";

export function Photo({
    kind,
    className,
    style,
}: {
    kind: PhotoKind;
    className?: string;
    style?: CSSProperties;
}) {
    return (
        <span
            aria-hidden
            className={cn("block bg-cover", className)}
            style={{ backgroundImage: PHOTOS[kind], ...style }}
        />
    );
}
