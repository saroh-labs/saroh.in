/**
 * The gallery's real renders (industry templates plan U14, KTD-6; Resources
 * plan R18): each template's pages as the renderer draws them for its sample
 * business, captured at 2× by `e2e/marketing-shots`, and saved under
 * `public/templates/<slug>/`.
 *
 * Keyed by the template's gallery slug, then the page's path (`/`,
 * `/timetable`). A page with a shot shows it — on the card (its home page,
 * desktop) and in the detail page's frame — and a page without one is drawn
 * from the template's data and colours (`components/v2/templates/
 * template-preview.tsx`), so the gallery never shows an empty frame while
 * captures are added one by one. `width`/`height` are the image's CSS size
 * (the file is twice that); the alt text is written by the page from the
 * template and page names.
 */
export interface TemplateShot {
    /** Under `public/`, e.g. `/templates/gym/home-desktop.webp`. */
    src: string;
    width: number;
    height: number;
}

export interface TemplatePageShots {
    desktop?: TemplateShot;
    phone?: TemplateShot;
}

export const TEMPLATE_SHOTS: Readonly<
    Partial<
        Record<string, Readonly<Partial<Record<string, TemplatePageShots>>>>
    >
> = {};

/** A page's shot for a device, when it has been captured. */
export function templateShot(
    slug: string,
    path: string,
    device: keyof TemplatePageShots,
): TemplateShot | undefined {
    return TEMPLATE_SHOTS[slug]?.[path]?.[device];
}
