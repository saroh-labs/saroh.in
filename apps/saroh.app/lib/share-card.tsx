import { ImageResponse } from "next/og";

/**
 * The picture a business shares of a live product or service (#1375, plan
 * 2026-11-12-002 U1): 1080×1350, portrait, which WhatsApp Status, an
 * Instagram post and Facebook all take. Drawn in the business's own look
 * (its `--site-*` colours and corner radius), never Saroh's: no Saroh mark,
 * name or colour, and a site with no look gets plain neutrals.
 *
 * shortcut: a placeholder layout (photo, name, price, business) until the
 * owner approves the design boards; replace `shareCard` and keep
 * `shareCardModel`'s inputs. The site's own typeface isn't used (its files
 * are woff2, which next/og can't read), so the card is set in next/og's
 * built-in face; a name in a non-Latin script may not draw until a font
 * is loaded here.
 */

export const SHARE_CARD_SIZE = { width: 1080, height: 1350 } as const;

/** How long a browser or the app may keep the picture: a price change shows within it. */
export const SHARE_CARD_CACHE = "public, max-age=300";

export interface ShareCardInput {
    name: string;
    /** The price as the site says it ("₹1,200"); null for none. */
    price: string | null;
    business: string;
    /** The photo as a `data:` address next/og can draw; null for none. */
    photo: string | null;
    /** The site's resolved look (`snapshot.site.styleVariables`). */
    variables?: Readonly<Record<string, string>> | null;
}

/** Plain neutrals for a site with no look saved: not Saroh's palette. */
const NEUTRAL = {
    bg: "0 0% 100%",
    fg: "24 10% 10%",
    muted: "24 5% 40%",
    accent: "24 10% 10%",
    accentFg: "0 0% 100%",
    border: "24 6% 90%",
};

/** An HSL triple as the publisher writes it: `24 10% 10%`. */
const HSL_TRIPLE =
    /^\d{1,3}(?:\.\d{1,4})? \d{1,3}(?:\.\d{1,4})?% \d{1,3}(?:\.\d{1,4})?%$/;

/** A `--site-*` colour as `hsl(…)`, only when it is a plain triple. */
function colour(value: string | undefined, fallback: string): string {
    const triple =
        value && HSL_TRIPLE.test(value.trim()) ? value.trim() : fallback;
    const [h, s, l] = triple.split(" ");
    return `hsl(${h}, ${s}, ${l})`;
}

/** `--site-radius` in pixels, kept to what a card can carry. */
function radius(value: string | undefined): number {
    const px = /^(\d{1,3})px$/.exec(value?.trim() ?? "");
    return px ? Math.min(Number(px[1]), 48) : 12;
}

/**
 * `text` in at most `lines` lines of about `perLine` characters, broken
 * at spaces, with "…" where it was cut. A word longer than a line is cut.
 */
export function clipLines(
    text: string,
    perLine: number,
    lines: number,
): string[] {
    const words = text.trim().split(/\s+/).filter(Boolean);
    const out: string[] = [];
    let line = "";
    let cut = false;
    for (const whole of words) {
        const word = whole.slice(0, perLine);
        if (word !== whole) cut = true;
        const next = line ? `${line} ${word}` : word;
        if (next.length <= perLine) {
            line = next;
            continue;
        }
        out.push(line);
        line = word;
        if (out.length === lines) {
            cut = true;
            line = "";
            break;
        }
    }
    if (line) out.push(line);
    if (cut && out.length) {
        const last = out[out.length - 1] ?? "";
        out[out.length - 1] =
            `${last.slice(0, Math.max(0, perLine - 1)).trimEnd()}…`;
    }
    return out;
}

/** What the card draws, worked out apart from drawing it. */
export function shareCardModel(input: ShareCardInput) {
    const v = input.variables ?? {};
    return {
        colours: {
            bg: colour(v["--site-bg"], NEUTRAL.bg),
            fg: colour(v["--site-fg"], NEUTRAL.fg),
            muted: colour(v["--site-muted"], NEUTRAL.muted),
            accent: colour(v["--site-accent"], NEUTRAL.accent),
            accentFg: colour(v["--site-accent-fg"], NEUTRAL.accentFg),
            border: colour(v["--site-border"], NEUTRAL.border),
        },
        radius: radius(v["--site-radius"]),
        nameLines: clipLines(input.name, 24, 2),
        price: input.price,
        business: clipLines(input.business, 40, 1)[0] ?? "",
        photo: input.photo,
    };
}

/** The card as a PNG response, with the headers the app needs to fetch it. */
export function shareCard(input: ShareCardInput): ImageResponse {
    const m = shareCardModel(input);
    const { colours: c } = m;
    return new ImageResponse(
        <div
            style={{
                width: "100%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                background: c.bg,
                color: c.fg,
                padding: 64,
                gap: 40,
            }}
        >
            {m.photo ? (
                // eslint-disable-next-line @next/next/no-img-element -- next/og draws a plain <img>
                <img
                    src={m.photo}
                    alt=""
                    width={952}
                    height={800}
                    style={{
                        width: 952,
                        height: 800,
                        objectFit: "cover",
                        borderRadius: m.radius,
                    }}
                />
            ) : (
                <div
                    style={{
                        width: 952,
                        height: 800,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: c.accent,
                        color: c.accentFg,
                        borderRadius: m.radius,
                        fontSize: 220,
                        fontWeight: 700,
                    }}
                >
                    {Array.from(input.name.trim())[0]?.toLocaleUpperCase() ??
                        ""}
                </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {m.nameLines.map((line, i) => (
                    <span
                        key={i}
                        style={{
                            fontSize: 72,
                            fontWeight: 700,
                            lineHeight: 1.1,
                            letterSpacing: "-0.02em",
                        }}
                    >
                        {line}
                    </span>
                ))}
                {m.price ? (
                    <span style={{ fontSize: 56, fontWeight: 600 }}>
                        {m.price}
                    </span>
                ) : null}
            </div>
            <span
                style={{
                    marginTop: "auto",
                    fontSize: 36,
                    color: c.muted,
                }}
            >
                {m.business}
            </span>
        </div>,
        {
            ...SHARE_CARD_SIZE,
            headers: {
                "cache-control": SHARE_CARD_CACHE,
                // Public data of a live item: the workspace fetches it.
                "access-control-allow-origin": "*",
            },
        },
    );
}

/** Formats next/og draws; WebP and the rest are left out. */
const DRAWABLE = new Set(["image/png", "image/jpeg"]);
/** The most a photo may weigh before the card goes without it. */
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/**
 * A photo as a `data:` address next/og can draw, or null when it can't be
 * fetched, is too heavy or is in a format it can't read (the card then
 * draws a tile). Never throws.
 *
 * shortcut: a WebP or AVIF photo gives the tile; transcode through the
 * site's image route when merchants' photos are mostly WebP.
 */
export async function photoData(
    url: string | null | undefined,
    fetcher: typeof fetch = fetch,
): Promise<string | null> {
    if (!url) return null;
    try {
        const res = await fetcher(url);
        if (!res.ok) return null;
        const type = (res.headers.get("content-type") ?? "")
            .split(";")[0]
            ?.trim()
            .toLowerCase();
        if (!type || !DRAWABLE.has(type)) return null;
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (bytes.byteLength > MAX_PHOTO_BYTES) return null;
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000) {
            binary += String.fromCharCode(
                ...Array.from(bytes.subarray(i, i + 0x8000)),
            );
        }
        return `data:${type};base64,${btoa(binary)}`;
    } catch {
        return null;
    }
}
