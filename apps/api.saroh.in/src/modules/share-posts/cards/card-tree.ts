import type { ShareCardInput } from "./card-model";
import { clipLines, ctaHeight, LEADING, shareCardModel } from "./card-model";

/**
 * A share picture as Takumi's node tree (#1375, plan 2026-11-12-003 U4):
 * the boxes `card-model.ts` worked out, drawn as the `SFCards` board does.
 * Takumi shapes Indic scripts as a browser does (next/og could not), and
 * falls back glyph by glyph along each text's font stack (`card-fonts.ts`).
 *
 * Every text line is a box of its own with a pixel line height, so the
 * glyphs sit where the model counted them, never below.
 */

type Style = Record<string, string | number>;

export type CardNode =
    | { type: "container"; style: Style; children: CardNode[] }
    | { type: "text"; text: string; style: Style }
    | { type: "image"; src: string; style: Style };

/** The two font stacks a card sets its text in. */
export interface CardFonts {
    /** The name, the offer's big line and the tag's price. */
    heading: string;
    /** Labels, prices and the web address. */
    body: string;
}

type Model = ReturnType<typeof shareCardModel>;

const box = (style: Style, children: (CardNode | null)[] = []): CardNode => ({
    type: "container",
    style: { display: "flex", ...style },
    children: children.filter((c): c is CardNode => c !== null),
});

const text = (
    value: string,
    size: number,
    family: string,
    style: Style = {},
    lead = LEADING.small,
): CardNode => ({
    type: "text",
    text: value,
    style: {
        fontFamily: family,
        fontSize: size,
        lineHeight: `${Math.round(size * lead)}px`,
        whiteSpace: "nowrap",
        ...style,
    },
});

/** A photo filling its box, or the letter tile without one. */
function photo(
    m: Model,
    f: CardFonts,
    width: number,
    height: number,
    style: Style = {},
    page = false,
): CardNode {
    if (m.photo) {
        return {
            type: "image",
            src: m.photo,
            style: { width, height, objectFit: "cover", ...style },
        };
    }
    // The page's colours on Price tag, so the accent tag stands out on it.
    return box(
        {
            width,
            height,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: page ? m.colours.bg : m.colours.accent,
            ...style,
        },
        [
            text(
                m.letter,
                Math.round(Math.min(width, height) * 0.4),
                f.heading,
                {
                    fontWeight: 700,
                    color: page ? m.colours.accent : m.colours.accentFg,
                },
                1,
            ),
        ],
    );
}

function label(m: Model, f: CardFonts, color: string): CardNode {
    const size = m.layout.small.label;
    return text(m.label, size, f.body, {
        fontWeight: 700,
        letterSpacing: Math.round(size * 0.16),
        color,
    });
}

function name(m: Model, f: CardFonts, center = false): CardNode {
    return box(
        {
            flexDirection: "column",
            alignItems: center ? "center" : "flex-start",
        },
        m.nameLines.map((line) =>
            text(
                line,
                m.layout.nameSize,
                f.heading,
                { fontWeight: 700 },
                LEADING.name,
            ),
        ),
    );
}

/** "₹360 · box of 6", or the offer's struck old price and its new one. */
function priceLine(m: Model, f: CardFonts, color: string): CardNode | null {
    if (!m.priceLine && !m.was) return null;
    const size = m.layout.small.price;
    return box({ flexDirection: "row", alignItems: "center" }, [
        m.was
            ? text(m.was, size, f.body, {
                  color,
                  opacity: 0.75,
                  textDecoration: "line-through",
                  marginRight: Math.round(size * 0.35),
              })
            : null,
        m.priceLine ? text(m.priceLine, size, f.body, { color }) : null,
    ]);
}

function address(m: Model, f: CardFonts, color: string): CardNode | null {
    if (!m.addressLine) return null;
    return text(m.addressLine, m.layout.small.web, f.body, {
        color,
        opacity: 0.9,
    });
}

/** "Book now" as the board's outlined pill (.fcta), in the card's ink. */
function cta(m: Model, f: CardFonts, color: string): CardNode | null {
    if (!m.cta) return null;
    const size = Math.round(0.6 * m.layout.em);
    const height = ctaHeight(size) - Math.round(size * 0.25);
    return box(
        {
            height,
            marginTop: Math.round(size * 0.25),
            padding: `0 ${Math.round(size * 0.8)}px`,
            alignItems: "center",
            borderRadius: Math.round(height / 2),
            border: `${Math.max(2, Math.round(size * 0.09))}px solid ${color}`,
        },
        [
            text(
                m.cta,
                size,
                f.body,
                {
                    fontWeight: 700,
                    letterSpacing: Math.round(size * 0.04),
                    color,
                },
                1,
            ),
        ],
    );
}

function circle(m: Model, f: CardFonts): CardNode | null {
    const { circle: size, ring = 0 } = m.layout;
    if (size <= 0) return null;
    return box(
        {
            width: size + 2 * ring,
            height: size + 2 * ring,
            borderRadius: "50%",
            border: `${ring}px solid ${m.colours.surface}`,
            overflow: "hidden",
        },
        [photo(m, f, size, size, { borderRadius: "50%" })],
    );
}

function mark(m: Model, f: CardFonts): CardNode {
    const size = Math.round(1.92 * m.layout.em);
    if (m.mark.logo) {
        return {
            type: "image",
            src: m.mark.logo,
            style: {
                width: size,
                height: size,
                borderRadius: "50%",
                objectFit: "cover",
            },
        };
    }
    return box(
        {
            width: size,
            height: size,
            borderRadius: "50%",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: m.colours.accent,
        },
        [
            text(
                m.mark.initials ?? "",
                Math.round(0.6 * m.layout.em),
                f.body,
                { fontWeight: 700, color: m.colours.accentFg },
                1,
            ),
        ],
    );
}

/** Photo: the cover above a band in the page's colours. */
function photoCard(m: Model, f: CardFonts): CardNode {
    const L = m.layout;
    const c = m.colours;
    return box(
        {
            flexDirection: "column",
            width: L.width,
            height: L.height,
            paddingTop: L.safe.top,
            paddingBottom: L.safe.bottom,
        },
        [
            photo(m, f, L.width, L.band.top - L.safe.top),
            box(
                {
                    flexDirection: "column",
                    gap: L.bandGap,
                    height: L.band.bottom - L.band.top,
                    padding: `${L.bandPad.y}px ${L.bandPad.x}px`,
                },
                [
                    label(m, f, c.accent),
                    name(m, f),
                    priceLine(m, f, c.muted),
                    address(m, f, c.muted),
                ],
            ),
        ],
    );
}

/** Price tag: the photo to the edges, a round tag and a dark band. */
function priceTagCard(m: Model, f: CardFonts): CardNode {
    const L = m.layout;
    const c = m.colours;
    const tag = L.tag;
    const tagNode =
        tag && m.price
            ? box(
                  {
                      position: "absolute",
                      top: tag.top,
                      right: tag.right,
                      width: tag.size,
                      height: tag.size,
                      borderRadius: "50%",
                      backgroundColor: c.accent,
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      transform: "rotate(-8deg)",
                  },
                  [
                      text(
                          m.price,
                          L.em,
                          f.heading,
                          { fontWeight: 700, color: c.accentFg },
                          1,
                      ),
                      m.unit
                          ? text(
                                clipLines(m.unit, 14, 1)[0] ?? "",
                                Math.round(0.45 * L.em),
                                f.body,
                                {
                                    color: c.accentFg,
                                    marginTop: Math.round(0.11 * L.em),
                                },
                                1.2,
                            )
                          : null,
                  ],
              )
            : null;
    return box({ position: "relative", width: L.width, height: L.height }, [
        photo(
            m,
            f,
            L.width,
            L.height,
            { position: "absolute", top: 0, left: 0 },
            true,
        ),
        tagNode,
        box(
            {
                position: "absolute",
                left: 0,
                top: L.band.top,
                width: L.width,
                height: L.band.bottom - L.band.top,
                flexDirection: "column",
                gap: L.bandGap,
                padding: `${L.bandPad.y}px ${L.bandPad.x}px`,
                backgroundColor: c.bandInk,
            },
            [
                label(m, f, c.bandLabel),
                recolour(name(m, f), c.bandInkText),
                address(m, f, c.bandInkText),
            ],
        ),
    ]);
}

/** The same lines in another colour (the name over the dark band). */
function recolour(node: CardNode, color: string): CardNode {
    if (node.type === "text") {
        return { ...node, style: { ...node.style, color } };
    }
    if (node.type === "container") {
        return {
            ...node,
            children: node.children.map((n) => recolour(n, color)),
        };
    }
    return node;
}

/** Offer, Colour and Simple: one centred column on a plain ground. */
function columnCard(m: Model, f: CardFonts): CardNode {
    const L = m.layout;
    const c = m.colours;
    const offer = L.style === "offer";
    // Colour is the Offer card's ground with the headline in place of a
    // discount (board SGCards).
    const coloured = offer || L.style === "colour";
    const ink = coloured ? c.bandAccentFg : c.fg;
    const children =
        L.style === "colour"
            ? [
                  label(m, f, ink),
                  recolour(name(m, f, true), ink),
                  priceLine(m, f, ink),
                  cta(m, f, ink),
                  address(m, f, ink),
              ]
            : offer
              ? [
                    label(m, f, ink),
                    text(
                        m.offer?.headline ?? "",
                        Math.round(2.5 * L.em),
                        f.heading,
                        { fontWeight: 700, color: ink },
                        LEADING.big,
                    ),
                    circle(m, f),
                    recolour(name(m, f, true), ink),
                    priceLine(m, f, ink),
                    address(m, f, ink),
                ]
              : [
                    mark(m, f),
                    recolour(name(m, f, true), ink),
                    priceLine(m, f, c.muted),
                    circle(m, f),
                    address(m, f, c.muted),
                ];
    return box(
        {
            width: L.width,
            height: L.height,
            paddingTop: L.safe.top,
            paddingBottom: L.safe.bottom,
            backgroundColor: coloured ? c.bandAccent : c.bg,
        },
        [
            box(
                {
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    width: L.width,
                    gap: L.gap ?? 0,
                    padding: L.pad ?? 0,
                    overflow: "hidden",
                },
                children,
            ),
        ],
    );
}

/** The whole card, ready for `Renderer.render`. */
export function cardTree(input: ShareCardInput, fonts: CardFonts): CardNode {
    const m = shareCardModel(input);
    const card =
        m.layout.style === "price"
            ? priceTagCard(m, fonts)
            : m.layout.style === "photo"
              ? photoCard(m, fonts)
              : columnCard(m, fonts);
    return box(
        {
            width: m.layout.width,
            height: m.layout.height,
            backgroundColor: m.colours.bg,
            color: m.colours.fg,
            overflow: "hidden",
        },
        [recolourDefault(card, m.colours.fg)],
    );
}

/** Text with no colour of its own takes the page's text colour. */
function recolourDefault(node: CardNode, color: string): CardNode {
    if (node.type === "text") {
        return "color" in node.style
            ? node
            : { ...node, style: { ...node.style, color } };
    }
    if (node.type === "container") {
        return {
            ...node,
            children: node.children.map((n) => recolourDefault(n, color)),
        };
    }
    return node;
}
