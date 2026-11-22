/**
 * "From your logo" (B3, DEC-247): the logo's two or three main colours,
 * read in the merchant's browser. Nothing is decoded on the server; the
 * colour picked is a brand colour like a typed one, so the API makes the
 * palette again from it and holds it to 4.5:1 (DEC-241).
 */

/** At most this many colours are offered. */
const MOST = 3;
/** Two colours closer than this (in RGB) are one colour. */
const APART = 60;
/** The logo is read at this size: enough to count, small to read. */
const SIDE = 64;

const hex = (n: number) => Math.round(n).toString(16).padStart(2, "0");

/** How grey a colour is: 0 grey, up to 255 fully coloured. */
const spread = (r: number, g: number, b: number) =>
    Math.max(r, g, b) - Math.min(r, g, b);

/**
 * The main colours of RGBA pixels, most used first, as `#RRGGBB`.
 * Clear pixels are skipped, and so are white and near-white, which are a
 * logo's ground. Greys and black count only when the logo has nothing
 * coloured.
 */
export function mainColours(data: ArrayLike<number>, most = MOST): string[] {
    const buckets = new Map<
        number,
        { n: number; r: number; g: number; b: number; grey: boolean }
    >();
    for (let i = 0; i + 3 < data.length; i += 4) {
        const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
        if (a < 128 || Math.min(r, g, b) > 235) continue;
        const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
        const bucket = buckets.get(key) ?? {
            n: 0,
            r: 0,
            g: 0,
            b: 0,
            grey: spread(r, g, b) < 24,
        };
        bucket.n += 1;
        bucket.r += r;
        bucket.g += g;
        bucket.b += b;
        buckets.set(key, bucket);
    }
    const all = Array.from(buckets.values())
        .map((x) => ({ ...x, r: x.r / x.n, g: x.g / x.n, b: x.b / x.n }))
        .sort((x, y) => y.n - x.n);
    const coloured = all.filter((x) => !x.grey);
    const pool = coloured.length > 0 ? coloured : all;
    const picked: typeof pool = [];
    for (const c of pool) {
        if (picked.length >= most) break;
        const near = picked.some(
            (p) => Math.hypot(p.r - c.r, p.g - c.g, p.b - c.b) < APART,
        );
        if (!near) picked.push(c);
    }
    return picked.map((c) =>
        `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`.toUpperCase(),
    );
}

/**
 * Read a logo's main colours. Rejects when the image can't be loaded or
 * its host doesn't allow it to be read (no CORS): the sheet then offers to
 * pick the file from the device instead, which is never uploaded.
 */
export function readLogoColours(src: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            try {
                const canvas = document.createElement("canvas");
                canvas.width = SIDE;
                canvas.height = SIDE;
                const ctx = canvas.getContext("2d");
                if (!ctx) throw new Error("No canvas");
                ctx.drawImage(img, 0, 0, SIDE, SIDE);
                resolve(mainColours(ctx.getImageData(0, 0, SIDE, SIDE).data));
            } catch (error) {
                // A host without CORS taints the canvas: a SecurityError.
                reject(
                    error instanceof Error ? error : new Error(String(error)),
                );
            }
        };
        img.onerror = () => reject(new Error("The logo didn't load"));
        img.src = src;
    });
}
