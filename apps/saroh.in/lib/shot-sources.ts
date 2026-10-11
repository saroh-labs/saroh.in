import WIDTHS from "@/content/shot-widths.json";

/**
 * The files a marketing screenshot is served from (12 Oct 2026).
 *
 * A screenshot is captured once, at twice its layout size
 * (`public/shots/v2/<key>.webp`), and `scripts/shot-sizes.mjs` writes a
 * smaller copy beside it for each width here that is narrower than the
 * capture (`public/shots/v2/sized/<key>-<width>.webp`). The page names them
 * all in a `srcset`, and the browser fetches the one that fits: a plain
 * file each, which Cloudflare serves without running the Worker and
 * `public/_headers` lets a browser keep. Nothing goes through
 * `/_next/image`, which re-encoded the picture on every request.
 */
export const SHOT_WIDTHS: readonly number[] = WIDTHS;

const CAPTURED_SHOT = /^\/shots\/v2\/([a-z0-9-]+)\.webp$/;

/** The sized copy of a captured shot at `width`, as the page addresses it. */
export const sizedShotSrc = (key: string, width: number) =>
    `/shots/v2/sized/${key}-${width}.webp`;

/** The widths a shot `width` pixels wide has a smaller copy at. */
export function sizedWidths(width: number): number[] {
    return SHOT_WIDTHS.filter((w) => w < width);
}

export interface ShotSources {
    /** The capture itself: the fallback, and the largest candidate. */
    src: string;
    /** Every copy with its width, smallest first; none for any other image. */
    srcSet?: string;
}

/**
 * What an `<img>` for this shot names. Only a captured marketing shot has
 * sized copies; any other address is served as it is.
 */
export function shotSources(shot: { src: string; width: number }): ShotSources {
    const key = CAPTURED_SHOT.exec(shot.src)?.[1];
    const smaller = key ? sizedWidths(shot.width) : [];
    if (!key || smaller.length === 0) return { src: shot.src };
    return {
        src: shot.src,
        srcSet: [
            ...smaller.map((w) => `${sizedShotSrc(key, w)} ${w}w`),
            `${shot.src} ${shot.width}w`,
        ].join(", "),
    };
}
