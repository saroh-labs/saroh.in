import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Logger } from "@nestjs/common";
import type { LookId } from "@saroh/block-contract";
import { findFontPair, LOOKS } from "@saroh/block-contract";

/**
 * The fonts a share picture is set in (#1375).
 *
 * - **Bundled:** Noto Sans and Noto Sans in eight Indian scripts, Regular
 *   and Bold (`assets/fonts`, OFL). Registered once per process, so a card
 *   always draws, whatever the script, with no network.
 * - **The site's own faces,** fetched from Google Fonts as TTF on first use
 *   and kept for the process. A fetch that fails is tried again after a
 *   while; meanwhile the card is set in the Noto chain.
 * - **A curated choice** (`?font=`) for a post in a regional language.
 *
 * Each text's stack is the chosen face, then the Noto face of each Indian
 * script the card's text uses, then Noto Sans: the renderer falls back
 * glyph by glyph along it.
 */

const logger = new Logger("ShareCardFonts");

/** `assets/fonts` beside `src` and `dist`: `modules/share-posts/cards` is three deep. */
const FONT_DIR = join(__dirname, "..", "..", "..", "..", "assets", "fonts");

export const BASE_FAMILY = "Noto Sans";

/** Each bundled script face, by the code points it draws. */
export const SCRIPT_FAMILIES = [
    {
        family: "Noto Sans Devanagari",
        file: "NotoSansDevanagari",
        from: 0x0900,
        to: 0x097f,
    },
    {
        family: "Noto Sans Bengali",
        file: "NotoSansBengali",
        from: 0x0980,
        to: 0x09ff,
    },
    {
        family: "Noto Sans Gurmukhi",
        file: "NotoSansGurmukhi",
        from: 0x0a00,
        to: 0x0a7f,
    },
    {
        family: "Noto Sans Gujarati",
        file: "NotoSansGujarati",
        from: 0x0a80,
        to: 0x0aff,
    },
    {
        family: "Noto Sans Tamil",
        file: "NotoSansTamil",
        from: 0x0b80,
        to: 0x0bff,
    },
    {
        family: "Noto Sans Telugu",
        file: "NotoSansTelugu",
        from: 0x0c00,
        to: 0x0c7f,
    },
    {
        family: "Noto Sans Kannada",
        file: "NotoSansKannada",
        from: 0x0c80,
        to: 0x0cff,
    },
    {
        family: "Noto Sans Malayalam",
        file: "NotoSansMalayalam",
        from: 0x0d00,
        to: 0x0d7f,
    },
] as const;

/** The bundled files, as `registerFont` takes them. */
export function bundledFonts(): {
    name: string;
    data: Buffer;
    weight: number;
}[] {
    const faces = [
        { family: BASE_FAMILY, file: "NotoSans" },
        ...SCRIPT_FAMILIES,
    ];
    return faces.flatMap(({ family, file }) =>
        (
            [
                ["Regular", 400],
                ["Bold", 700],
            ] as const
        ).map(([style, weight]) => ({
            name: family,
            data: readFileSync(join(FONT_DIR, `${file}-${style}.ttf`)),
            weight,
        })),
    );
}

/** The Indian-script faces `text` needs, in the list's order. */
export function scriptFamilies(text: string): string[] {
    const needed = new Set<string>();
    for (const char of text) {
        const code = char.codePointAt(0) ?? 0;
        const script = SCRIPT_FAMILIES.find(
            (s) => code >= s.from && code <= s.to,
        );
        if (script) needed.add(script.family);
    }
    return SCRIPT_FAMILIES.map((s) => s.family).filter((f) => needed.has(f));
}

/** A CSS font stack: `primary` (when loaded), the scripts `text` uses, Noto Sans. */
export function fontStack(primary: string | null, text: string): string {
    const families = [
        ...(primary ? [primary] : []),
        ...scriptFamilies(text),
        BASE_FAMILY,
    ];
    return [...new Set(families)].map((f) => `'${f}'`).join(", ");
}

const own = (object: object, key: string) =>
    Object.prototype.hasOwnProperty.call(object, key);

/** `?font=`: the faces a post may ask for by name, beside the site's own. */
export const CURATED_FONTS: Readonly<Record<string, string>> = {
    poppins: "Poppins",
    mukta: "Mukta",
    hind: "Hind",
    "baloo-2": "Baloo 2",
    "rozha-one": "Rozha One",
    "yatra-one": "Yatra One",
    "tiro-devanagari-hindi": "Tiro Devanagari Hindi",
};

/** The curated family `?font=` names, or null for the site's own. */
export function curatedFont(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const key = value.trim().toLowerCase();
    return own(CURATED_FONTS, key) ? (CURATED_FONTS[key] ?? null) : null;
}

/**
 * The site's heading and body families from its resolved look: the pair's
 * key in `--site-font-heading`, else its look's pair. Null for a role set
 * in the system stack.
 */
export function siteFamilies(
    variables: Readonly<Record<string, string>> | null | undefined,
    look: unknown,
): { heading: string | null; body: string | null } {
    const key =
        variables?.["--site-font-heading"] ??
        (typeof look === "string" && own(LOOKS, look)
            ? LOOKS[look as LookId].fontPair
            : null);
    const pair = findFontPair(key);
    return {
        heading: pair?.heading.family ?? null,
        body: pair?.body.family ?? null,
    };
}

/** A family name Google Fonts could have; anything else is never fetched. */
const FAMILY = /^[A-Za-z0-9][A-Za-z0-9 ]{0,60}$/;

/** How long a failed fetch is kept before it is tried again. */
const RETRY_MS = 10 * 60_000;
const FETCH_TIMEOUT_MS = 4_000;
/** No font file is this large; a bigger answer is not one. */
const MAX_FONT_BYTES = 4 * 1024 * 1024;

export interface FontSink {
    registerFont(font: {
        name: string;
        data: Buffer;
        weight: number;
    }): Promise<unknown>;
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Google Fonts' families, fetched as TTF (it serves TrueType to a client
 * that doesn't ask for WOFF2) and registered into one renderer.
 */
export class GoogleFonts {
    private readonly kept = new Map<
        string,
        { ready: Promise<boolean>; at: number; failed: boolean }
    >();

    constructor(
        private readonly sink: FontSink,
        private readonly fetcher: Fetch = fetch,
        private readonly now: () => number = Date.now,
    ) {}

    /** Whether `family` is ready to set text in. Never throws. */
    load(family: string | null): Promise<boolean> {
        if (!family || !FAMILY.test(family)) return Promise.resolve(false);
        const kept = this.kept.get(family);
        if (kept && !(kept.failed && this.now() - kept.at >= RETRY_MS)) {
            return kept.ready;
        }
        const entry = {
            at: this.now(),
            failed: false,
            ready: Promise.resolve(false),
        };
        entry.ready = this.fetchFamily(family)
            .catch((error: unknown) => {
                logger.warn(
                    `share_card_font_failed family="${family}" error=${error instanceof Error ? error.name : "unknown"}`,
                );
                return false;
            })
            .then((ok) => {
                entry.failed = !ok;
                return ok;
            });
        this.kept.set(family, entry);
        return entry.ready;
    }

    private async fetchFamily(family: string): Promise<boolean> {
        const name = family.replace(/ /g, "+");
        const css =
            (await this.text(
                `https://fonts.googleapis.com/css2?family=${name}:wght@400;700`,
            )) ??
            (await this.text(
                `https://fonts.googleapis.com/css2?family=${name}`,
            ));
        if (!css) return false;
        const faces = [
            ...css.matchAll(
                /font-weight:\s*(\d{3});[^}]*?src:\s*url\((https:\/\/fonts\.gstatic\.com\/[^)\s]+\.ttf)\)/g,
            ),
        ];
        let registered = 0;
        for (const [, weight, url] of faces) {
            if (!url) continue;
            const res = await this.fetcher(url, {
                signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            });
            if (!res.ok) continue;
            const data = Buffer.from(await res.arrayBuffer());
            if (data.byteLength === 0 || data.byteLength > MAX_FONT_BYTES)
                continue;
            await this.sink.registerFont({
                name: family,
                data,
                weight: Number(weight),
            });
            registered += 1;
        }
        return registered > 0;
    }

    private async text(url: string): Promise<string | null> {
        const res = await this.fetcher(url, {
            // A plain client gets TrueType; nothing about the caller is sent.
            headers: { "user-agent": "saroh-share-cards" },
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        return res.ok ? res.text() : null;
    }
}
