/**
 * The gallery's real renders (industry templates plan U14, KTD-6; Resources
 * plan R18): each template's pages as the renderer draws them for its sample
 * business, captured at 2× by `e2e/marketing-shots/template-shots.ts`, and
 * saved under `public/templates/<slug>/`. Generated: re-run the capture
 * instead of editing the entries.
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
> = {
    bakery: {
        "/": {
            desktop: {
                src: "/templates/bakery/home-desktop.webp",
                width: 1440,
                height: 900,
            },
            phone: {
                src: "/templates/bakery/home-phone.webp",
                width: 390,
                height: 844,
            },
        },
    },
    blogs: {
        "/": {
            desktop: {
                src: "/templates/blogs/home-desktop.webp",
                width: 1440,
                height: 900,
            },
            phone: {
                src: "/templates/blogs/home-phone.webp",
                width: 390,
                height: 844,
            },
        },
    },
    clinic: {
        "/": {
            desktop: {
                src: "/templates/clinic/home-desktop.webp",
                width: 1440,
                height: 900,
            },
            phone: {
                src: "/templates/clinic/home-phone.webp",
                width: 390,
                height: 844,
            },
        },
    },
    developer: {
        "/": {
            desktop: {
                src: "/templates/developer/home-desktop.webp",
                width: 1440,
                height: 900,
            },
            phone: {
                src: "/templates/developer/home-phone.webp",
                width: 390,
                height: 844,
            },
        },
    },
    dietician: {
        "/": {
            desktop: {
                src: "/templates/dietician/home-desktop.webp",
                width: 1440,
                height: 900,
            },
            phone: {
                src: "/templates/dietician/home-phone.webp",
                width: 390,
                height: 844,
            },
        },
    },
    gym: {
        "/": {
            desktop: {
                src: "/templates/gym/home-desktop.webp",
                width: 1440,
                height: 900,
            },
            phone: {
                src: "/templates/gym/home-phone.webp",
                width: 390,
                height: 844,
            },
        },
        "/membership": {
            desktop: {
                src: "/templates/gym/membership-desktop.webp",
                width: 1440,
                height: 900,
            },
            phone: {
                src: "/templates/gym/membership-phone.webp",
                width: 390,
                height: 844,
            },
        },
        "/timetable": {
            desktop: {
                src: "/templates/gym/timetable-desktop.webp",
                width: 1440,
                height: 900,
            },
            phone: {
                src: "/templates/gym/timetable-phone.webp",
                width: 390,
                height: 844,
            },
        },
        "/trainers": {
            desktop: {
                src: "/templates/gym/trainers-desktop.webp",
                width: 1440,
                height: 900,
            },
            phone: {
                src: "/templates/gym/trainers-phone.webp",
                width: 390,
                height: 844,
            },
        },
    },
    salon: {
        "/": {
            desktop: {
                src: "/templates/salon/home-desktop.webp",
                width: 1440,
                height: 900,
            },
            phone: {
                src: "/templates/salon/home-phone.webp",
                width: 390,
                height: 844,
            },
        },
    },
    store: {
        "/": {
            desktop: {
                src: "/templates/store/home-desktop.webp",
                width: 1440,
                height: 900,
            },
            phone: {
                src: "/templates/store/home-phone.webp",
                width: 390,
                height: 844,
            },
        },
    },
    studio: {
        "/": {
            desktop: {
                src: "/templates/studio/home-desktop.webp",
                width: 1440,
                height: 900,
            },
            phone: {
                src: "/templates/studio/home-phone.webp",
                width: 390,
                height: 844,
            },
        },
    },
};

/** A page's shot for a device, when it has been captured. */
export function templateShot(
    slug: string,
    path: string,
    device: keyof TemplatePageShots,
): TemplateShot | undefined {
    return TEMPLATE_SHOTS[slug]?.[path]?.[device];
}
