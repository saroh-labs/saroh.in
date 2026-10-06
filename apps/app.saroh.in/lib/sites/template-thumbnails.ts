/**
 * The template picker's card pictures (industry templates U14): each
 * template's home page in its first colourway, as the renderer draws it for
 * the template's sample business, captured by
 * `e2e/marketing-shots/template-shots.ts` into `public/templates/<id>.webp`.
 * Generated: re-run the capture instead of editing the entries.
 *
 * Keyed by template id, as the API lists templates. A template with no entry
 * keeps the drawn card (`TemplateThumbnail`). `width`/`height` are the
 * picture's CSS size (the file is twice that).
 */
export interface TemplateThumbnailImage {
    /** Under `public/`, e.g. `/templates/gym.webp`. */
    src: string;
    width: number;
    height: number;
}

export const TEMPLATE_THUMBNAILS: Readonly<
    Partial<Record<string, TemplateThumbnailImage>>
> = {
    bakery: {
        src: "/templates/bakery.webp",
        width: 360,
        height: 225,
    },
    clinic: {
        src: "/templates/clinic.webp",
        width: 360,
        height: 225,
    },
    dietician: {
        src: "/templates/dietician.webp",
        width: 360,
        height: 225,
    },
    gym: {
        src: "/templates/gym.webp",
        width: 360,
        height: 225,
    },
    salon: {
        src: "/templates/salon.webp",
        width: 360,
        height: 225,
    },
};

/** A template's captured card picture, when there is one. */
export function templateThumbnail(
    id: string,
): TemplateThumbnailImage | undefined {
    return TEMPLATE_THUMBNAILS[id];
}
