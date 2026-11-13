/**
 * What a share picture draws and where (#1375, plan 2026-11-12-003 U4),
 * worked out apart from drawing it (`card-tree.ts`), so the sizes, the
 * Story's safe zones and the colours are tested without a renderer.
 *
 * Five styles (Photo, Price tag, Offer, Simple, Colour) in three sizes (Post
 * 1080×1350, Square 1080×1080, Story 1080×1920), as the approved `SFCards`
 * board draws them, in the business's own look (its `--site-*` colours and
 * corner radius), never Saroh's. A Story keeps its top 13% and bottom 20%
 * free of text, tag and band; only the Price tag's photo runs under them.
 *
 * Colour (owner, 12 Nov 2026; board SGCards) is the Offer card's ground
 * with a headline in place of a discount. A card may be given its own
 * ground and ink (`#rrggbb`) over the site's; with a ground alone, the
 * ink is white or black, whichever reads.
 */

export const SHARE_STYLES = [
    "photo",
    "price",
    "offer",
    "simple",
    "colour",
] as const;
export type ShareStyle = (typeof SHARE_STYLES)[number];

export const SHARE_SIZES = {
    post: { width: 1080, height: 1350 },
    square: { width: 1080, height: 1080 },
    story: { width: 1080, height: 1920 },
} as const;
export type ShareSize = keyof typeof SHARE_SIZES;

/** `?style=`: anything unknown is Photo. */
export function shareStyleOf(value: string | null | undefined): ShareStyle {
    return (SHARE_STYLES as readonly string[]).includes(value ?? "")
        ? (value as ShareStyle)
        : "photo";
}

/** `?size=`: anything unknown is Post. */
export function shareSizeOf(value: string | null | undefined): ShareSize {
    return Object.keys(SHARE_SIZES).includes(value ?? "")
        ? (value as ShareSize)
        : "post";
}

/** `?w=`: a smaller picture (a thumbnail) this many pixels wide, or the full size. */
export const THUMB_WIDTH = { min: 64, max: 540 } as const;

export function shareWidthOf(value: unknown): number | null {
    if (typeof value !== "string" || !/^\d{2,3}$/.test(value)) return null;
    const w = Number(value);
    return w >= THUMB_WIDTH.min && w <= THUMB_WIDTH.max ? w : null;
}

/** `#rrggbb` and nothing else, in lower case; anything else is none. */
export function hexColourOf(value: unknown): string | null {
    return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)
        ? value.toLowerCase()
        : null;
}

/** `#rrggbb` as an HSL triple (`24 10% 10%`), for the contrast sum. */
function hexTriple(hex: string): string {
    const [r, g, b] = [1, 3, 5].map(
        (i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255,
    );
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    const h =
        d === 0
            ? 0
            : max === r
              ? 60 * (((g - b) / d + 6) % 6)
              : max === g
                ? 60 * ((b - r) / d + 2)
                : 60 * ((r - g) / d + 4);
    const n = (v: number) => Math.round(v * 100) / 100;
    return `${n(h)} ${n(s * 100)}% ${n(l * 100)}%`;
}

/** How long a browser or the app may keep the picture: a price change shows within it. */
export const SHARE_CARD_CACHE = "public, max-age=300";

/** A live discount on what is shared (the Offer style's badge). */
export interface ShareOffer {
    /** "20% off", "₹50 off". */
    headline: string;
    /** "this week only", "until 30 Nov"; null with no end. */
    until?: string | null;
    /** The price before and after, when it is one product's. */
    was?: string | null;
    now?: string | null;
    /** The code to type at checkout. */
    code?: string | null;
}

export interface ShareCardInput {
    style?: ShareStyle;
    size?: ShareSize;
    name: string;
    /** The price as the site says it ("₹1,200"); null for none. */
    price: string | null;
    /** What follows the price ("box of 6", "90 min", "Read more"). */
    unit?: string | null;
    offer?: ShareOffer | null;
    business: string;
    /** The photo's `src` among the render's images; null for none. */
    photo: string | null;
    /** The site's logo the same way; null draws its initials. */
    logo?: string | null;
    /** The live site's web address, with no scheme. */
    address?: string;
    /** The site's resolved look (`snapshot.site.styleVariables`). */
    variables?: Readonly<Record<string, string>> | null;
    /** The button's words ("Book now", "Read more"): a pill on Colour, the line under the name elsewhere. */
    cta?: string | null;
    /** What kind of page it is, after the business in the label ("Bookings", "From the blog"). */
    kindLabel?: string | null;
    /** This card's own ground, `#rrggbb`, over the site's; else none. */
    ground?: string | null;
    /** This card's own text colour, `#rrggbb`; else picked for the ground. */
    ink?: string | null;
}

/** Plain neutrals for a site with no look saved: not Saroh's palette. */
const NEUTRAL = {
    bg: "0 0% 100%",
    fg: "24 10% 10%",
    muted: "24 5% 40%",
    accent: "24 10% 10%",
    accentFg: "0 0% 100%",
};

/** An HSL triple as the publisher writes it: `24 10% 10%`. */
const HSL_TRIPLE =
    /^\d{1,3}(?:\.\d{1,4})? \d{1,3}(?:\.\d{1,4})?% \d{1,3}(?:\.\d{1,4})?%$/;

function triple(value: string | undefined): string | null {
    const v = value?.trim();
    return v && HSL_TRIPLE.test(v) ? v : null;
}

function hsl(t: string): string {
    const [h, s, l] = t.split(" ");
    return `hsl(${h}, ${s}, ${l})`;
}

/** WCAG relative luminance of an HSL triple. */
function luminance(t: string): number {
    const [h = 0, s = 0, l = 0] = t
        .split(" ")
        .map((part) => Number.parseFloat(part));
    const sat = s / 100;
    const light = l / 100;
    const a = sat * Math.min(light, 1 - light);
    const channel = (n: number) => {
        const k = (n + h / 30) % 12;
        const c = light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(0) + 0.7152 * channel(8) + 0.0722 * channel(4);
}

/** White or black, whichever reads better on `ground` (no token of its own). */
export function inkOn(ground: string): "#FFFFFF" | "#000000" {
    const lum = luminance(ground);
    return 1.05 / (lum + 0.05) >= (lum + 0.05) / 0.05 ? "#FFFFFF" : "#000000";
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

/** "Rye & Co." → "R&C": the mark when the site has no logo. */
export function initials(name: string): string {
    return (
        name
            .trim()
            .split(/\s+/)
            .map((word) => Array.from(word)[0] ?? "")
            // A letter (it has a case), a digit or "&": never a stray mark.
            .filter(
                (c) => c.toLowerCase() !== c.toUpperCase() || /[0-9&]/.test(c),
            )
            .slice(0, 3)
            .join("")
            .toLocaleUpperCase()
    );
}

/** Characters of `px` text that fit `width`: the built-in face averages 0.55em. */
const fits = (px: number, width: number) =>
    Math.max(6, Math.floor(width / (px * 0.55)));

/** How tall each line of text stands, by its size. */
export const LEADING = { name: 1.08, big: 0.95, small: 1.3 };

/** The pill's height for its text size (the board's 1.9em, and .25em above). */
export const ctaHeight = (size: number) => Math.round(size * 2.15);

/** A box on the card, top and bottom in pixels from its top edge. */
export interface Box {
    top: number;
    bottom: number;
}

/** The line under the name: its own, else the button's words where no pill is drawn. */
const unitOf = (input: ShareCardInput, style: ShareStyle) =>
    input.unit ?? (style === "colour" ? null : (input.cta ?? null));

/**
 * Where everything goes on one card, worked out apart from drawing it, so
 * the safe zones and the fit are tested without a renderer. Sizes follow
 * the board: one `em` is the card's width over 17 (13.5 on a Story).
 */
export function shareCardLayout(input: ShareCardInput) {
    const size = input.size ?? "post";
    // The Offer style needs an offer; without one it is the Photo card.
    const style =
        input.style === "offer" && !input.offer
            ? "photo"
            : (input.style ?? "photo");
    const { width, height } = SHARE_SIZES[size];
    const story = size === "story";
    const em = Math.round(width / (story ? 13.5 : 17));
    const safe = story
        ? { top: Math.round(height * 0.13), bottom: Math.round(height * 0.2) }
        : { top: 0, bottom: 0 };
    const px = (n: number) => Math.round(n * em);
    const small = { label: px(0.55), price: px(0.8), web: px(0.55) };
    const bandPad = { x: px(0.95), y: px(0.7) };
    const textWidth = width - 2 * bandPad.x;
    const line = (size: number, lines = 1, lead = LEADING.small) =>
        Math.round(size * lead) * lines;

    // Colour's headline is the card: three lines, then smaller in four or
    // five before it is cut, so a 90-character headline fits whole.
    const steps: [number, number][] =
        style === "colour"
            ? [
                  [1.6, 3],
                  [1.2, 4],
                  [1, 5],
              ]
            : [[style === "simple" ? 1.6 : style === "offer" ? 1.1 : 1.35, 2]];
    let nameSize = 0;
    let nameLines: string[] = [];
    for (const [k, lines] of steps) {
        nameSize = px(k);
        nameLines = clipLines(input.name, fits(nameSize, textWidth), lines);
        if (!nameLines.join(" ").endsWith("…")) break;
    }
    const nameHeight = line(nameSize, nameLines.length, LEADING.name);
    const content = { top: safe.top, bottom: height - safe.bottom };
    const unit = unitOf(input, style);
    const hasPrice = Boolean(
        input.offer?.now ?? input.price ?? (input.offer ? null : unit),
    );
    const priceHeight = hasPrice ? line(small.price) : 0;

    if (style === "photo" || style === "price") {
        const bandGap = px(style === "photo" ? 0.18 : 0.15);
        const bandHeight =
            2 * bandPad.y +
            line(small.label) +
            nameHeight +
            (style === "photo" && hasPrice ? priceHeight + bandGap : 0) +
            line(small.web) +
            3 * bandGap;
        const band: Box = {
            top: content.bottom - bandHeight,
            bottom: content.bottom,
        };
        const tagSize = px(3.7);
        const tag: Box & { size: number; right: number } = {
            top: safe.top + px(0.8),
            bottom: safe.top + px(0.8) + tagSize,
            size: tagSize,
            right: px(0.8),
        };
        return {
            style,
            size,
            width,
            height,
            em,
            safe,
            small,
            bandPad,
            bandGap,
            nameSize,
            nameLines,
            textWidth,
            band,
            tag,
            // The text a reader needs: the band, and the tag on Price tag.
            text: style === "price" ? [band, tag] : [band],
            circle: 0,
        };
    }

    // Offer and Simple: one centred column inside the safe box.
    const gap = px(0.45);
    const pad = px(0.9);
    const items =
        style === "colour"
            ? [
                  line(small.label),
                  nameHeight,
                  priceHeight,
                  // The button, as the board's pill (.fcta).
                  ...(input.cta ? [ctaHeight(px(0.6))] : []),
                  line(small.web),
              ]
            : style === "offer"
              ? [
                    line(small.label),
                    line(px(2.5), 1, LEADING.big),
                    nameHeight,
                    priceHeight,
                    line(small.web),
                ]
              : [px(1.92), nameHeight, priceHeight, line(small.web)];
    const textHeight = items.reduce((sum, h) => sum + h, 0);
    const inner = content.bottom - content.top - 2 * pad;
    // A gap above each item and the circle, less one: n items + 1 circle.
    const room = inner - textHeight - items.length * gap;
    const ratio =
        style === "offer"
            ? { post: 0.42, square: 0.3, story: 0.5 }[size]
            : { post: 0.36, square: 0.26, story: 0.46 }[size];
    const ring = Math.round(0.22 * em);
    // The photo gives way before any text does.
    // Colour has no photo: the headline is the card.
    const circle =
        style === "colour"
            ? 0
            : Math.max(
                  0,
                  Math.min(
                      Math.round(
                          ratio * Math.min(width, content.bottom - content.top),
                      ),
                      room - 2 * ring,
                  ),
              );
    const used = textHeight + items.length * gap + circle + 2 * ring;
    const top = content.top + pad + Math.max(0, (inner - used) / 2);
    const column: Box = {
        top: Math.round(top),
        bottom: Math.round(top + used),
    };
    return {
        style,
        size,
        width,
        height,
        em,
        safe,
        small,
        bandPad,
        bandGap: gap,
        nameSize,
        nameLines,
        textWidth: width - 2 * pad,
        band: column,
        tag: null,
        text: [column],
        circle,
        ring,
        gap,
        pad,
    };
}

/** What the card draws, worked out apart from drawing it. */
export function shareCardModel(input: ShareCardInput) {
    const v = input.variables ?? {};
    const pick = (name: string, fallback: string) =>
        triple(v[name]) ?? fallback;
    const fg = pick("--site-fg", NEUTRAL.fg);
    const accent = pick("--site-accent", NEUTRAL.accent);
    const accentFg = pick("--site-accent-fg", NEUTRAL.accentFg);
    const bg = pick("--site-bg", NEUTRAL.bg);
    // The site's bands default to its ink and accent (`site-theme.tsx`).
    const bandInk = pick("--site-band-ink", fg);
    const bandAccent = pick("--site-band-accent", accent);
    const bandInkText = inkOn(bandInk);
    const soft = triple(v["--site-accent-soft"]);
    const layout = shareCardLayout(input);
    // The card's own colours, over the site's ground and text.
    const ground = hexColourOf(input.ground);
    const ink =
        hexColourOf(input.ink) ?? (ground ? inkOn(hexTriple(ground)) : null);
    const offer = layout.style === "offer" ? input.offer : null;
    const was = input.offer?.was && input.offer.now ? input.offer.was : null;
    const label = [
        input.business,
        input.kindLabel,
        layout.style === "offer" ? input.offer?.until : null,
    ]
        .filter(Boolean)
        .join(" · ")
        .toLocaleUpperCase();
    return {
        layout,
        colours: {
            bg: ground ?? hsl(bg),
            fg: ink ?? hsl(fg),
            muted: ink ?? hsl(pick("--site-muted", NEUTRAL.muted)),
            surface: ground ?? hsl(pick("--site-surface", bg)),
            accent: hsl(accent),
            accentFg: hsl(accentFg),
            bandAccent: ground ?? hsl(bandAccent),
            bandAccentFg: ink ?? hsl(pick("--site-band-accent-fg", accentFg)),
            bandInk: hsl(bandInk),
            bandInkText,
            // The label over the dark band: the look's soft accent when it
            // has one, else the band's own text.
            bandLabel: soft ? hsl(soft) : bandInkText,
        },
        radius: radius(v["--site-radius"]),
        label,
        nameLines: layout.nameLines,
        offer,
        price: input.offer?.now ?? input.price,
        was,
        unit: unitOf(input, layout.style),
        cta: layout.style === "colour" ? (input.cta ?? null) : null,
        // One line each: an offer's code goes before the address, and its
        // price line keeps to the old and new price.
        priceLine:
            clipLines(
                [
                    input.offer?.now ?? input.price,
                    input.offer ? null : unitOf(input, layout.style),
                ]
                    .filter(Boolean)
                    .join(" · "),
                fits(layout.small.price, layout.textWidth) -
                    (was?.length ?? 0) -
                    1,
                1,
            )[0] ?? "",
        addressLine:
            clipLines(
                [
                    input.offer?.code ? `code ${input.offer.code}` : null,
                    input.address,
                ]
                    .filter(Boolean)
                    .join(" · "),
                fits(layout.small.web, layout.textWidth),
                1,
            )[0] ?? "",
        photo: input.photo,
        letter: Array.from(input.name.trim())[0]?.toLocaleUpperCase() ?? "",
        mark: input.logo
            ? { logo: input.logo, initials: null }
            : { logo: null, initials: initials(input.business) },
    };
}
