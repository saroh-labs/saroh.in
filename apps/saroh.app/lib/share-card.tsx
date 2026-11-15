// Parked: the API draws share pictures now (Takumi, apps/api.saroh.in/src/modules/share-posts/cards); next/og can't shape Indic scripts.
import type { CSSProperties, ReactElement, ReactNode } from "react";

import { ImageResponse } from "next/og";

import type { ShareCardInput } from "./share-card-model";
import {
    clipLines,
    LEADING,
    SHARE_CARD_CACHE,
    SHARE_SIZES,
    shareCardModel,
} from "./share-card-model";

/**
 * The picture a business shares of something on its live site (#1375, plan
 * 2026-11-12-003 U4): four styles (Photo, Price tag, Offer, Simple) in
 * three sizes (Post 1080×1350, Square 1080×1080, Story 1080×1920), as the
 * approved `SFCards` board draws them. Drawn in the business's own look
 * (its `--site-*` colours and corner radius), never Saroh's: no Saroh mark,
 * name or colour, and a site with no look gets plain neutrals.
 *
 * A Story keeps its top 13% and bottom 20% free of text, tag and band, so
 * Instagram's and WhatsApp's own bars never cover the name or price; only
 * the Price tag's photo runs under them.
 *
 * The site's own typeface isn't used (its files are woff2, which next/og
 * can't read), so the card is set in next/og's built-in face at the
 * board's sizes; a name in a non-Latin script may not draw until a font
 * is loaded here.
 */

type Model = ReturnType<typeof shareCardModel>;

/** A photo filling its box, or the letter tile in the accent without one. */
function Photo({
    m,
    width,
    height,
    style,
    page,
}: {
    m: Model;
    width: number;
    height: number;
    style?: CSSProperties;
    /** The tile in the page's colours, so the accent tag stands out on it. */
    page?: boolean;
}) {
    if (m.photo) {
        return (
            // eslint-disable-next-line @next/next/no-img-element -- next/og draws a plain <img>
            <img
                src={m.photo}
                alt=""
                width={width}
                height={height}
                style={{ width, height, objectFit: "cover", ...style }}
            />
        );
    }
    return (
        <div
            style={{
                width,
                height,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: page ? m.colours.bg : m.colours.accent,
                color: page ? m.colours.accent : m.colours.accentFg,
                fontSize: Math.round(Math.min(width, height) * 0.4),
                fontWeight: 700,
                ...style,
            }}
        >
            {m.letter}
        </div>
    );
}

function Text({
    children,
    size,
    lead = LEADING.small,
    style,
}: {
    children: ReactNode;
    size: number;
    lead?: number;
    style?: CSSProperties;
}) {
    return (
        <span
            style={{
                display: "flex",
                fontSize: size,
                lineHeight: lead,
                ...style,
            }}
        >
            {children}
        </span>
    );
}

function Label({ m, color }: { m: Model; color: string }) {
    const { small } = m.layout;
    return (
        <Text
            size={small.label}
            style={{
                fontWeight: 700,
                letterSpacing: Math.round(small.label * 0.16),
                color,
            }}
        >
            {m.label}
        </Text>
    );
}

function Name({ m, align }: { m: Model; align?: "center" }) {
    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                alignItems: align === "center" ? "center" : "flex-start",
            }}
        >
            {m.nameLines.map((line, i) => (
                <Text
                    key={i}
                    size={m.layout.nameSize}
                    lead={LEADING.name}
                    style={{ fontWeight: 700, letterSpacing: "-0.01em" }}
                >
                    {line}
                </Text>
            ))}
        </div>
    );
}

/** "₹360 · box of 6", or the offer's struck old price and its new one. */
function PriceLine({ m, color }: { m: Model; color: string }) {
    if (!m.priceLine && !m.was) return null;
    const { small } = m.layout;
    return (
        <Text size={small.price} style={{ color }}>
            {m.was ? (
                <span
                    style={{
                        textDecoration: "line-through",
                        opacity: 0.75,
                        marginRight: Math.round(small.price * 0.35),
                    }}
                >
                    {m.was}
                </span>
            ) : null}
            <span>{m.priceLine}</span>
        </Text>
    );
}

function Address({ m, color }: { m: Model; color: string }) {
    if (!m.addressLine) return null;
    return (
        <Text size={m.layout.small.web} style={{ color, opacity: 0.9 }}>
            {m.addressLine}
        </Text>
    );
}

function Circle({ m }: { m: Model }) {
    const { circle, ring = 0 } = m.layout;
    if (circle <= 0) return null;
    return (
        <div
            style={{
                display: "flex",
                width: circle + 2 * ring,
                height: circle + 2 * ring,
                borderRadius: "50%",
                border: `${ring}px solid ${m.colours.surface}`,
                overflow: "hidden",
            }}
        >
            <Photo
                m={m}
                width={circle}
                height={circle}
                style={{ borderRadius: "50%" }}
            />
        </div>
    );
}

function Mark({ m }: { m: Model }) {
    const size = Math.round(1.92 * m.layout.em);
    if (m.mark.logo) {
        return (
            // eslint-disable-next-line @next/next/no-img-element -- next/og draws a plain <img>
            <img
                src={m.mark.logo}
                alt=""
                width={size}
                height={size}
                style={{
                    width: size,
                    height: size,
                    borderRadius: "50%",
                    objectFit: "cover",
                }}
            />
        );
    }
    return (
        <div
            style={{
                display: "flex",
                width: size,
                height: size,
                borderRadius: "50%",
                alignItems: "center",
                justifyContent: "center",
                background: m.colours.accent,
                color: m.colours.accentFg,
                fontSize: Math.round(0.6 * m.layout.em),
                fontWeight: 700,
            }}
        >
            {m.mark.initials}
        </div>
    );
}

/** Photo: the cover above a band in the page's colours. */
function PhotoCard({ m }: { m: Model }) {
    const L = m.layout;
    const c = m.colours;
    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                width: L.width,
                height: L.height,
                paddingTop: L.safe.top,
                paddingBottom: L.safe.bottom,
            }}
        >
            <Photo m={m} width={L.width} height={L.band.top - L.safe.top} />
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: L.bandGap,
                    height: L.band.bottom - L.band.top,
                    padding: `${L.bandPad.y}px ${L.bandPad.x}px`,
                }}
            >
                <Label m={m} color={c.accent} />
                <Name m={m} />
                <PriceLine m={m} color={c.muted} />
                <Address m={m} color={c.muted} />
            </div>
        </div>
    );
}

/** Price tag: the photo to the edges, a round tag and a dark band. */
function PriceTagCard({ m }: { m: Model }) {
    const L = m.layout;
    const c = m.colours;
    const tag = L.tag;
    return (
        <div
            style={{
                display: "flex",
                position: "relative",
                width: L.width,
                height: L.height,
            }}
        >
            <Photo
                m={m}
                width={L.width}
                height={L.height}
                style={{ position: "absolute", top: 0, left: 0 }}
                page
            />
            {tag && m.price ? (
                <div
                    style={{
                        position: "absolute",
                        top: tag.top,
                        right: tag.right,
                        width: tag.size,
                        height: tag.size,
                        borderRadius: "50%",
                        background: c.accent,
                        color: c.accentFg,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        transform: "rotate(-8deg)",
                    }}
                >
                    <Text size={L.em} lead={1} style={{ fontWeight: 700 }}>
                        {m.price}
                    </Text>
                    {m.unit ? (
                        <Text
                            size={Math.round(0.45 * L.em)}
                            lead={1.2}
                            style={{ marginTop: Math.round(0.11 * L.em) }}
                        >
                            {clipLines(m.unit, 14, 1)[0] ?? ""}
                        </Text>
                    ) : null}
                </div>
            ) : null}
            <div
                style={{
                    position: "absolute",
                    left: 0,
                    top: L.band.top,
                    width: L.width,
                    height: L.band.bottom - L.band.top,
                    display: "flex",
                    flexDirection: "column",
                    gap: L.bandGap,
                    padding: `${L.bandPad.y}px ${L.bandPad.x}px`,
                    background: c.bandInk,
                    color: c.bandInkText,
                }}
            >
                <Label m={m} color={c.bandLabel} />
                <Name m={m} />
                <Address m={m} color={c.bandInkText} />
            </div>
        </div>
    );
}

/** Offer and Simple: one centred column on a plain ground. */
function ColumnCard({ m }: { m: Model }) {
    const L = m.layout;
    const c = m.colours;
    const offer = L.style === "offer";
    const ink = offer ? c.bandAccentFg : c.fg;
    return (
        <div
            style={{
                display: "flex",
                width: L.width,
                height: L.height,
                paddingTop: L.safe.top,
                paddingBottom: L.safe.bottom,
                background: offer ? c.bandAccent : c.bg,
                color: ink,
            }}
        >
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    textAlign: "center",
                    width: L.width,
                    gap: L.gap,
                    padding: L.pad,
                    overflow: "hidden",
                }}
            >
                {/* next/og lays a fragment out as a row: plain lists. */}
                {offer
                    ? [
                          <Label key="l" m={m} color={ink} />,
                          <Text
                              key="b"
                              size={Math.round(2.5 * L.em)}
                              lead={LEADING.big}
                              style={{
                                  fontWeight: 700,
                                  letterSpacing: "-0.02em",
                              }}
                          >
                              {m.offer?.headline ?? ""}
                          </Text>,
                          <Circle key="c" m={m} />,
                          <Name key="n" m={m} align="center" />,
                          <PriceLine key="p" m={m} color={ink} />,
                          <Address key="a" m={m} color={ink} />,
                      ]
                    : [
                          <Mark key="m" m={m} />,
                          <Name key="n" m={m} align="center" />,
                          <PriceLine key="p" m={m} color={c.muted} />,
                          <Circle key="c" m={m} />,
                          <Address key="a" m={m} color={c.muted} />,
                      ]}
            </div>
        </div>
    );
}

/** The card's element, apart from the response, for a test to read. */
export function shareCardElement(input: ShareCardInput): ReactElement {
    const m = shareCardModel(input);
    const card =
        m.layout.style === "price" ? (
            <PriceTagCard m={m} />
        ) : m.layout.style === "photo" ? (
            <PhotoCard m={m} />
        ) : (
            <ColumnCard m={m} />
        );
    return (
        <div
            style={{
                display: "flex",
                width: "100%",
                height: "100%",
                background: m.colours.bg,
                color: m.colours.fg,
                borderRadius: 0,
                overflow: "hidden",
            }}
        >
            {card}
        </div>
    );
}

/** The card as a PNG response, with the headers the app needs to fetch it. */
export function shareCard(input: ShareCardInput): ImageResponse {
    const { width, height } = SHARE_SIZES[input.size ?? "post"];
    return new ImageResponse(shareCardElement(input), {
        width,
        height,
        headers: {
            "cache-control": SHARE_CARD_CACHE,
            // Public data of a live item: the workspace fetches it.
            "access-control-allow-origin": "*",
        },
    });
}
