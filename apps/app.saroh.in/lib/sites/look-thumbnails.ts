/**
 * The Look row's phone pictures (DEC-172, U16): each gallery template's
 * home page on a phone in each look, as the renderer draws it for the
 * template's sample business, captured by
 * `e2e/marketing-shots/template-shots.ts` (`--looks`) into
 * `public/looks/<template>-<look>.webp`. Generated: re-run the capture
 * instead of editing the entries.
 *
 * Keyed `<template>:<look>`, Classic as `classic`. A pair with no entry
 * keeps the drawn phone (`LookThumbnail`), in the business's own colours.
 * `width`/`height` are the picture's CSS size (the file is twice that).
 */
export interface LookThumbnailImage {
    /** Under `public/`, e.g. `/looks/salon-quiet.webp`. */
    src: string;
    width: number;
    height: number;
}

export const LOOK_THUMBNAILS: Readonly<
    Partial<Record<string, LookThumbnailImage>>
> = {};

/** The template whose pictures stand in for a site made from none. */
export const LOOK_THUMBNAIL_FALLBACK_TEMPLATE = "salon";

/**
 * The picture for `look` ("classic" for Classic) on a site made from
 * `templateId`: its own template's, else the stand-in template's, else
 * none (the drawn phone).
 */
export function lookThumbnail(
    templateId: string | null | undefined,
    look: string,
    images: Readonly<
        Partial<Record<string, LookThumbnailImage>>
    > = LOOK_THUMBNAILS,
): LookThumbnailImage | undefined {
    const own = templateId ? images[`${templateId}:${look}`] : undefined;
    return own ?? images[`${LOOK_THUMBNAIL_FALLBACK_TEMPLATE}:${look}`];
}
