/**
 * The two generated manifests the template captures write (industry
 * templates U14): the gallery's `apps/saroh.in/content/template-shots.ts`
 * and the picker's `apps/app.saroh.in/lib/sites/template-thumbnails.ts`.
 *
 * Pure: given what is on disk, the same text every time — templates by
 * slug (or id), pages with `/` first then by path, devices desktop then
 * phone — so a re-run that captured nothing new changes nothing, and a diff
 * shows only the shots that did change. `template-shots-manifest.test.ts`
 * holds it to that.
 */

export type Device = "desktop" | "phone";

/** One captured image, with its size in CSS pixels (the file is twice it). */
export interface CapturedShot {
    slug: string;
    path: string;
    device: Device;
    src: string;
    width: number;
    height: number;
}

/** The picker's card picture for one template. */
export interface CapturedThumbnail {
    id: string;
    src: string;
    width: number;
    height: number;
}

const byPath = (a: string, b: string) =>
    a === b ? 0 : a === "/" ? -1 : b === "/" ? 1 : a < b ? -1 : 1;

const DEVICES: readonly Device[] = ["desktop", "phone"];

const json = (value: string) => JSON.stringify(value);

/** An object key as prettier writes it: bare when it can be, else quoted. */
const key = (value: string) =>
    /^[A-Za-z_$][\w$]*$/.test(value) ? value : json(value);

/** `apps/saroh.in/content/template-shots.ts`, from every shot on disk. */
export function templateShotsSource(shots: readonly CapturedShot[]): string {
    const slugs = [...new Set(shots.map((s) => s.slug))].sort();
    const entries = slugs.map((slug) => {
        const mine = shots.filter((s) => s.slug === slug);
        const paths = [...new Set(mine.map((s) => s.path))].sort(byPath);
        const pages = paths.map((path) => {
            const devices = DEVICES.flatMap((device) => {
                const shot = mine.find(
                    (s) => s.path === path && s.device === device,
                );
                return shot
                    ? [
                          `            ${device}: {\n` +
                              `                src: ${json(shot.src)},\n` +
                              `                width: ${shot.width},\n` +
                              `                height: ${shot.height},\n` +
                              `            },`,
                      ]
                    : [];
            });
            return `        ${key(path)}: {\n${devices.join("\n")}\n        },`;
        });
        return `    ${key(slug)}: {\n${pages.join("\n")}\n    },`;
    });
    const body = entries.length > 0 ? `{\n${entries.join("\n")}\n}` : "{}";
    return `/**
 * The gallery's real renders (industry templates plan U14, KTD-6; Resources
 * plan R18): each template's pages as the renderer draws them for its sample
 * business, captured at 2× by \`e2e/marketing-shots/template-shots.ts\`, and
 * saved under \`public/templates/<slug>/\`. Generated: re-run the capture
 * instead of editing the entries.
 *
 * Keyed by the template's gallery slug, then the page's path (\`/\`,
 * \`/timetable\`). A page with a shot shows it — on the card (its home page,
 * desktop) and in the detail page's frame — and a page without one is drawn
 * from the template's data and colours (\`components/v2/templates/
 * template-preview.tsx\`), so the gallery never shows an empty frame while
 * captures are added one by one. \`width\`/\`height\` are the image's CSS size
 * (the file is twice that); the alt text is written by the page from the
 * template and page names.
 */
export interface TemplateShot {
    /** Under \`public/\`, e.g. \`/templates/gym/home-desktop.webp\`. */
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
> = ${body};

/** A page's shot for a device, when it has been captured. */
export function templateShot(
    slug: string,
    path: string,
    device: keyof TemplatePageShots,
): TemplateShot | undefined {
    return TEMPLATE_SHOTS[slug]?.[path]?.[device];
}
`;
}

/** `apps/app.saroh.in/lib/sites/template-thumbnails.ts`, from disk. */
export function templateThumbnailsSource(
    thumbnails: readonly CapturedThumbnail[],
): string {
    const sorted = [...thumbnails].sort((a, b) =>
        a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    );
    const entries = sorted.map(
        (t) =>
            `    ${key(t.id)}: {\n` +
            `        src: ${json(t.src)},\n` +
            `        width: ${t.width},\n` +
            `        height: ${t.height},\n` +
            `    },`,
    );
    const body = entries.length > 0 ? `{\n${entries.join("\n")}\n}` : "{}";
    return `/**
 * The template picker's card pictures (industry templates U14): each
 * template's home page in its first colourway, as the renderer draws it for
 * the template's sample business, captured by
 * \`e2e/marketing-shots/template-shots.ts\` into \`public/templates/<id>.webp\`.
 * Generated: re-run the capture instead of editing the entries.
 *
 * Keyed by template id, as the API lists templates. A template with no entry
 * keeps the drawn card (\`TemplateThumbnail\`). \`width\`/\`height\` are the
 * picture's CSS size (the file is twice that).
 */
export interface TemplateThumbnailImage {
    /** Under \`public/\`, e.g. \`/templates/gym.webp\`. */
    src: string;
    width: number;
    height: number;
}

export const TEMPLATE_THUMBNAILS: Readonly<
    Partial<Record<string, TemplateThumbnailImage>>
> = ${body};

/** A template's captured card picture, when there is one. */
export function templateThumbnail(
    id: string,
): TemplateThumbnailImage | undefined {
    return TEMPLATE_THUMBNAILS[id];
}
`;
}
