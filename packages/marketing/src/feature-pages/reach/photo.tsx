import type { DrawnPhotoKind } from "../../kit/drawn-photo";
import { DrawnPhoto } from "../../kit/drawn-photo";

/**
 * The Reach boards' stand-in product photos (FW, FS), from the kit's
 * `drawn-photo`: drawn bakes, not
 * pictures of a real shop, so a drawing never passes for a capture. Each is
 * a fill only: the caller sizes it and gives it its corners. Keyed by what
 * it shows, so any world's item can name one (`photoFor`).
 */
export type PhotoKind = DrawnPhotoKind;

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
            // saroh.tech's bakery (its world's item keys).
            "cinnamon-bun": "buns",
            "cinnamon-six": "buns",
            "sourdough-small": "loaf",
            focaccia: "loaf",
            "truffle-cake": "brownies",
            "walnut-cake": "brownies",
            "holiday-box": "festive",
        }) as Record<string, PhotoKind>
    )[itemKey] ?? "buns";

/** The kit's `DrawnPhoto`, by the name the Reach pages draw it with. */
export const Photo = DrawnPhoto;
