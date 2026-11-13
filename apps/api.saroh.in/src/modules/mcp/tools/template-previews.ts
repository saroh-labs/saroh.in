import { Logger } from "@nestjs/common";
import { getTemplate } from "@saroh/templates";

/**
 * What an AI app shows the person about a template (DEC-216, 13 Nov 2026):
 * a link that opens the template in Saroh, on this business, where the
 * picker previews the business's own site in it; and the card picture the
 * picker shows, as a link and, for the first few, as the image itself so
 * the app can see it and describe it.
 *
 * The pictures are the app's own (`apps/app.saroh.in/public/templates/<id>.webp`,
 * captured by `e2e/marketing-shots/template-shots.ts` for every template
 * with a sample business), served from the business's edition's app.
 */
const logger = new Logger("TemplatePreviews");

/** Whether the app has a card picture for this template. */
export function hasPicture(templateId: string): boolean {
    return !!getTemplate(templateId)?.sample;
}

export function pictureUrl(appBase: string, templateId: string): string {
    return `${appBase}/templates/${encodeURIComponent(templateId)}.webp`;
}

/** The new-site picker on this template, opened on this business. */
export function previewUrl(
    appBase: string,
    organizationId: string,
    templateId: string,
): string {
    const to = `/sites/new?${new URLSearchParams({ template: templateId }).toString()}`;
    return `${appBase}/open/${encodeURIComponent(organizationId)}?${new URLSearchParams({ to }).toString()}`;
}

/** How many pictures one list carries as images; the rest as links only. */
export const IMAGES_PER_LIST = 4;
const MAX_BYTES = 200_000;
const TIMEOUT_MS = 3_000;

// The files change only with a deploy of the app; a failed fetch isn't kept.
const cache = new Map<string, string>();

/**
 * A card picture as base64, or null when it can't be had in time. Never
 * throws: the list is complete without it, the link still says where it is.
 */
export async function pictureData(
    url: string,
    fetcher: typeof fetch = fetch,
): Promise<string | null> {
    const kept = cache.get(url);
    if (kept) return kept;
    try {
        const res = await fetcher(url, {
            signal: AbortSignal.timeout(TIMEOUT_MS),
            redirect: "error",
        });
        if (!res.ok || res.headers.get("content-type") !== "image/webp") {
            throw new Error(
                `answered ${res.status} ${res.headers.get("content-type") ?? ""}`,
            );
        }
        const bytes = Buffer.from(await res.arrayBuffer());
        if (bytes.length > MAX_BYTES) throw new Error("too large");
        const data = bytes.toString("base64");
        cache.set(url, data);
        return data;
    } catch (error) {
        // Degraded path: the template is listed with its picture as a link.
        logger.warn(
            `template_picture_failed url=${url}: ${error instanceof Error ? error.message : String(error)}`,
        );
        return null;
    }
}
