import { existsSync } from "node:fs";
import { join } from "node:path";

import type { Screenshot } from "./site-content";

/**
 * Whether an image is in public/. The design's full-size screens have to be
 * exported by hand (they are larger than the design tool hands over), so a
 * page asks at build time and uses the detail crop until they arrive — rather
 * than shipping a broken image.
 */
export function inPublic(src: string): boolean {
    return existsSync(join(process.cwd(), "public", src));
}

/** The best image of a screen that is actually on disk. */
export function bestShot(shot: Screenshot): {
    src: string;
    w: number;
    h: number;
} {
    return shot.full && inPublic(shot.full.src) ? shot.full : shot.crop;
}
