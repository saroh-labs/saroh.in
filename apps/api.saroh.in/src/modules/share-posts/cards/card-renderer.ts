import { Logger } from "@nestjs/common";
import type { Node } from "@takumi-rs/core";
import { Renderer } from "@takumi-rs/core";

import { bundledFonts, fontStack, GoogleFonts } from "./card-fonts";
import type { ShareCardInput } from "./card-model";
import { SHARE_SIZES } from "./card-model";
import { cardTree } from "./card-tree";

/**
 * Draws a share picture as a PNG with Takumi (#1375): one renderer per
 * process, its bundled fonts registered once, the site's own faces added as
 * they are first asked for.
 */

const logger = new Logger("ShareCardRenderer");

export interface CardRender extends Omit<ShareCardInput, "photo" | "logo"> {
    /** The photo's bytes; a format the renderer can't read draws the tile. */
    photo: Uint8Array | null;
    logo?: Uint8Array | null;
    /** Families to set the card in before the Noto chain; null: none. */
    fonts: { heading: string | null; body: string | null };
}

/** PNG, JPEG, WebP or GIF by its first bytes; AVIF and the rest are not drawn. */
export function drawable(bytes: Uint8Array | null | undefined): boolean {
    if (!bytes || bytes.length < 12) return false;
    const at = (i: number, ...values: number[]) =>
        values.every((v, k) => bytes[i + k] === v);
    return (
        at(0, 0x89, 0x50, 0x4e, 0x47) ||
        at(0, 0xff, 0xd8, 0xff) ||
        (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) ||
        at(0, 0x47, 0x49, 0x46, 0x38)
    );
}

let shared: {
    renderer: Renderer;
    google: GoogleFonts;
    ready: Promise<void>;
} | null = null;

/** The process's renderer, its bundled fonts registered. */
function renderer() {
    if (!shared) {
        // Its cache is native memory outside the V8 heap the container's
        // limit leaves room for (Dockerfile: 448MB, 320MB of heap): kept
        // small, a decoded photo or two.
        const r = new Renderer({ cacheMaxBytes: 16 * 1024 * 1024 });
        const ready = Promise.all(
            bundledFonts().map((font) => r.registerFont(font)),
        ).then(() => undefined);
        shared = {
            renderer: r,
            google: new GoogleFonts(r),
            ready,
        };
    }
    return shared;
}

/** Every word on the card, for picking the scripts' faces. */
function words(input: CardRender): string {
    return [
        input.name,
        input.business,
        input.price,
        input.unit,
        input.address,
        input.offer?.headline,
        input.offer?.until,
        input.offer?.was,
        input.offer?.now,
        input.offer?.code,
    ]
        .filter(Boolean)
        .join(" ");
}

/** The card as PNG bytes. */
export async function renderCard(input: CardRender): Promise<Buffer> {
    const { renderer: r, google, ready } = renderer();
    await ready;
    const [heading, body] = await Promise.all([
        google.load(input.fonts.heading),
        google.load(input.fonts.body),
    ]);
    const text = words(input);
    const fonts = {
        heading: fontStack(heading ? input.fonts.heading : null, text),
        body: fontStack(body ? input.fonts.body : null, text),
    };
    const photo = drawable(input.photo) ? input.photo : null;
    const logo = drawable(input.logo) ? input.logo : null;
    const images = [
        ...(photo ? [{ src: "photo", data: photo }] : []),
        ...(logo ? [{ src: "logo", data: logo }] : []),
    ];
    const card: ShareCardInput = {
        ...input,
        photo: photo ? "photo" : null,
        logo: logo ? "logo" : null,
    };
    const { width, height } = SHARE_SIZES[input.size ?? "post"];
    const draw = (withImages: boolean) =>
        r.render(
            cardTree(
                withImages ? card : { ...card, photo: null, logo: null },
                fonts,
            ) as unknown as Node,
            {
                width,
                height,
                format: "png",
                images: withImages ? images : [],
            },
        );
    try {
        return await draw(true);
    } catch (error) {
        if (!images.length) throw error;
        // A photo that looked like an image and wasn't: the tile instead.
        logger.warn(
            `share_card_photo_undrawable error=${error instanceof Error ? error.name : "unknown"}`,
        );
        return draw(false);
    }
}
