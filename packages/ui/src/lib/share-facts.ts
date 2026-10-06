/**
 * The rules behind a shared link's card (#220; resources plan KTD-4): what
 * a picture must be for each app to draw it large, and which address may be
 * drawn at all. Pure, so the site settings and the link preview tool read
 * the same limits.
 */

export interface ShareImageFacts {
    url: string;
    width?: number | null;
    height?: number | null;
    bytes?: number | null;
}

/** Facebook and LinkedIn crop to this; smaller pictures are shown, but blurred or boxed. */
export const SHARE_IMAGE_MIN = { width: 1200, height: 630 } as const;
/** Above this WhatsApp stops drawing the large picture and falls back to a thumbnail, or nothing. */
export const WHATSAPP_MAX_BYTES = 300 * 1024;

/**
 * The address as something an <img> may be pointed at, or null.
 *
 * The api accepts only http(s) for the share image (#227); this is the same
 * rule on the client, applied before a pasted string that has not been saved
 * yet reaches a `src`. React escapes the attribute, so nothing here was
 * exploitable — but a `javascript:` or `data:` value would have drawn a broken
 * picture and a misleading card, and the rule belongs at every sink, not only
 * the one that persists.
 */
export function webImageUrl(value: string | null | undefined): string | null {
    if (!value) return null;
    let url: URL;
    try {
        url = new URL(value.trim());
    } catch {
        return null;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.href;
}

/** Whether the picture is known to be smaller than the apps want. */
export function isSmallImage(image: ShareImageFacts | null): boolean {
    return (
        !!image?.width &&
        !!image.height &&
        (image.width < SHARE_IMAGE_MIN.width ||
            image.height < SHARE_IMAGE_MIN.height)
    );
}

/** Whether WhatsApp will draw it large: its size known and its file light. */
export function isWhatsappLarge(image: ShareImageFacts | null): boolean {
    return (
        !!image?.width &&
        !!image.height &&
        (!image.bytes || image.bytes <= WHATSAPP_MAX_BYTES)
    );
}

/**
 * Everything the merchant should know about the picture before they share,
 * with the limit in the sentence. Exported so the rules can be read in one
 * place; the component draws them.
 */
export function shareImageWarnings(image: ShareImageFacts | null): string[] {
    if (!image) {
        return [
            "No share image yet. Without one, WhatsApp, Slack and X show the link as text.",
        ];
    }
    const out: string[] = [];
    const { width, height, bytes } = image;
    if (width && height) {
        if (isSmallImage(image)) {
            out.push(
                `Facebook and LinkedIn want at least ${SHARE_IMAGE_MIN.width}×${SHARE_IMAGE_MIN.height}. This picture is ${width}×${height}, so they will show it small or blurred.`,
            );
        }
        const ratio = width / height;
        if (ratio < 1.6 || ratio > 2.2) {
            out.push(
                `Cards are cut to about 1.91:1. This picture is ${ratio.toFixed(2)}:1, so the top and bottom or the sides will be cropped.`,
            );
        }
    }
    if (bytes && bytes > WHATSAPP_MAX_BYTES) {
        out.push(
            `WhatsApp drops the large picture for files over ${Math.round(WHATSAPP_MAX_BYTES / 1024)} KB. This one is ${Math.round(bytes / 1024)} KB.`,
        );
    }
    return out;
}

/** The two places that will refetch a cached card, keyed by the live URL. */
export function inspectorLinks(
    liveUrl: string,
): { label: string; href: string }[] {
    const q = encodeURIComponent(liveUrl);
    return [
        {
            label: "Facebook Sharing Debugger",
            href: `https://developers.facebook.com/tools/debug/?q=${q}`,
        },
        {
            label: "LinkedIn Post Inspector",
            href: `https://www.linkedin.com/post-inspector/inspect/${q}`,
        },
    ];
}

/** A description cut to one card line: 70 characters, else 68 and "…". */
export function shortLine(text: string, max = 70): string {
    const value = text.trim();
    return value.length > max ? `${value.slice(0, max - 2)}…` : value;
}
