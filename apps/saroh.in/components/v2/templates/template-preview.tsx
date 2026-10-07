import type { CSSProperties, ReactNode } from "react";

import type {
    GalleryTemplate,
    PreviewPage,
    PreviewSection,
} from "@/content/templates";

/**
 * A template's page drawn from its own data (industry templates plan U13):
 * the sections its manifest lays down for the sample business, in the
 * template's colours and type, with the headings it actually writes. It
 * stands in for U14's 2× render of the same page (`template-shots.ts`) and
 * is replaced by it page by page.
 *
 * Every size is in the design's pixels on a 1280px-wide page (390px on a
 * phone) and scaled to the frame with container units, so a card and the
 * detail page draw the same page at different sizes. Decorative: the caller
 * gives the frame its accessible name.
 */

export type PreviewDevice = "desktop" | "phone";

const WIDTH: Record<PreviewDevice, number> = { desktop: 1280, phone: 390 };

/** A length in design pixels, scaled to the frame. */
const u = (px: number) => `calc(var(--tp-u) * ${px})`;

/** Grid columns for a block with `items` tiles. */
function columns(items: number, phone: boolean, max = 4): number {
    if (phone) return items > 2 ? 2 : Math.max(items, 1);
    return Math.min(Math.max(items, 1), max);
}

function Bars({ lines, width = 100 }: { lines: number; width?: number }) {
    return (
        <span style={{ display: "grid", gap: u(8) }}>
            {Array.from({ length: lines }, (_, i) => (
                <span
                    key={i}
                    style={{
                        display: "block",
                        height: u(10),
                        width: `${i === lines - 1 ? width * 0.6 : width}%`,
                        borderRadius: u(5),
                        background: "var(--tp-surface)",
                    }}
                />
            ))}
        </span>
    );
}

function Title({ text, size = 30 }: { text?: string; size?: number }) {
    if (!text) return null;
    return (
        <span
            style={{
                display: "block",
                fontFamily: "var(--tp-heading)",
                fontSize: u(size),
                fontWeight: 600,
                lineHeight: 1.1,
                letterSpacing: "-0.01em",
                color: "var(--tp-ink)",
                marginBottom: u(20),
            }}
        >
            {text}
        </span>
    );
}

function Line({ text, size = 16 }: { text?: string; size?: number }) {
    if (!text) return null;
    return (
        <span
            style={{
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                fontSize: u(size),
                lineHeight: 1.5,
                color: "var(--tp-muted)",
                maxWidth: u(720),
            }}
        >
            {text}
        </span>
    );
}

function Tiles({
    count,
    phone,
    ratio,
    captions = true,
}: {
    count: number;
    phone: boolean;
    ratio: string;
    captions?: boolean;
}) {
    return (
        <span
            style={{
                display: "grid",
                gridTemplateColumns: `repeat(${columns(count, phone)}, 1fr)`,
                gap: u(phone ? 12 : 20),
            }}
        >
            {Array.from({ length: count }, (_, i) => (
                <span key={i} style={{ display: "grid", gap: u(10) }}>
                    <span
                        style={{
                            display: "block",
                            aspectRatio: ratio,
                            background: "var(--tp-surface)",
                            borderRadius: "var(--tp-radius)",
                        }}
                    />
                    {captions ? <Bars lines={2} width={80} /> : null}
                </span>
            ))}
        </span>
    );
}

function Cards({ count, phone }: { count: number; phone: boolean }) {
    return (
        <span
            style={{
                display: "grid",
                gridTemplateColumns: `repeat(${columns(count, phone, 3)}, 1fr)`,
                gap: u(phone ? 12 : 20),
            }}
        >
            {Array.from({ length: count }, (_, i) => (
                <span
                    key={i}
                    style={{
                        display: "grid",
                        gap: u(12),
                        padding: u(20),
                        border: "1px solid var(--tp-line)",
                        borderRadius: "var(--tp-radius)",
                    }}
                >
                    <span
                        style={{
                            display: "block",
                            height: u(14),
                            width: "50%",
                            borderRadius: u(7),
                            background: "var(--tp-ink)",
                            opacity: 0.8,
                        }}
                    />
                    <Bars lines={2} />
                </span>
            ))}
        </span>
    );
}

function Rows({
    count,
    accent,
}: {
    count: number;
    /** Mark the last part of each row in the accent (the timetable's places). */
    accent?: boolean;
}) {
    return (
        <span style={{ display: "grid" }}>
            {Array.from({ length: count }, (_, i) => (
                <span
                    key={i}
                    style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 3fr 1fr",
                        alignItems: "center",
                        gap: u(16),
                        padding: `${u(14)} 0`,
                        borderTop: "1px solid var(--tp-line)",
                    }}
                >
                    <Bars lines={1} width={70} />
                    <Bars lines={1} width={90} />
                    <span
                        style={{
                            display: "block",
                            justifySelf: "end",
                            height: u(10),
                            width: "60%",
                            borderRadius: u(5),
                            background: accent
                                ? "var(--tp-accent)"
                                : "var(--tp-surface)",
                        }}
                    />
                </span>
            ))}
        </span>
    );
}

function Form() {
    return (
        <span style={{ display: "grid", gap: u(12), maxWidth: u(560) }}>
            {[0, 1, 2].map((i) => (
                <span
                    key={i}
                    style={{
                        display: "block",
                        height: u(i === 2 ? 96 : 44),
                        border: "1px solid var(--tp-line)",
                        borderRadius: "var(--tp-radius)",
                    }}
                />
            ))}
            <Button />
        </span>
    );
}

function Button() {
    return (
        <span
            style={{
                display: "block",
                height: u(44),
                width: u(160),
                borderRadius: "var(--tp-radius)",
                background: "var(--tp-accent)",
            }}
        />
    );
}

function Section({
    section,
    phone,
}: {
    section: PreviewSection;
    phone: boolean;
}) {
    const pad = `${u(phone ? 36 : 56)} ${u(phone ? 20 : 48)}`;
    const items = section.items;
    let body: ReactNode;
    switch (section.type) {
        case "hero":
            return (
                <span
                    style={{
                        display: "grid",
                        gap: u(20),
                        padding: `${u(phone ? 56 : 96)} ${u(phone ? 20 : 48)}`,
                        background: "var(--tp-paper)",
                    }}
                >
                    <span
                        style={{
                            fontFamily: "var(--tp-heading)",
                            fontSize: u(phone ? 40 : 76),
                            fontWeight: 600,
                            lineHeight: 1.02,
                            letterSpacing: "-0.02em",
                            color: "var(--tp-ink)",
                            maxWidth: u(980),
                        }}
                    >
                        {section.heading}
                    </span>
                    <Line text={section.line} size={phone ? 16 : 20} />
                </span>
            );
        case "productGrid":
        case "gallery":
            body = (
                <Tiles
                    count={items || 4}
                    phone={phone}
                    ratio="4 / 5"
                    captions={section.type === "productGrid"}
                />
            );
            break;
        case "projects":
            body = (
                <Tiles
                    count={Math.min(items || 3, 4)}
                    phone={phone}
                    ratio="4 / 3"
                />
            );
            break;
        case "journal":
            body = <Rows count={items || 3} />;
            break;
        case "timetable":
            body = <Rows count={items || 5} accent />;
            break;
        case "hours":
            body = <Rows count={items || 3} />;
            break;
        case "plans":
        case "packs":
        case "servicesList":
        case "features":
        case "testimonials":
        case "faq":
            body = (
                <Cards
                    count={Math.min(items || 3, phone ? 2 : 3)}
                    phone={phone}
                />
            );
            break;
        case "person":
            return (
                <span
                    style={{
                        display: "grid",
                        gridTemplateColumns: phone ? "1fr" : `${u(280)} 1fr`,
                        gap: u(32),
                        padding: pad,
                        alignItems: "start",
                    }}
                >
                    <span
                        style={{
                            display: "block",
                            aspectRatio: "4 / 5",
                            background: "var(--tp-surface)",
                            borderRadius: "var(--tp-radius)",
                        }}
                    />
                    <span style={{ display: "grid", gap: u(12) }}>
                        <Title text={section.heading} size={34} />
                        <Line text={section.line} />
                    </span>
                </span>
            );
        case "enquiry":
        case "contact":
        case "booking":
            body = <Form />;
            break;
        case "cta":
            body = <Button />;
            break;
        default:
            body = section.line ? null : <Bars lines={3} />;
    }
    return (
        <span style={{ display: "grid", padding: pad }}>
            <Title text={section.heading} />
            {section.type === "richText" ||
            section.type === "enquiry" ||
            section.type === "contact" ? (
                <span style={{ display: "block", marginBottom: u(20) }}>
                    <Line text={section.line} />
                </span>
            ) : null}
            {body}
        </span>
    );
}

export function TemplatePreview({
    template,
    page,
    device = "desktop",
}: {
    template: GalleryTemplate;
    page: PreviewPage;
    device?: PreviewDevice;
}) {
    const phone = device === "phone";
    const c = template.colours;
    const style = {
        "--tp-u": `calc(100cqw / ${WIDTH[device]})`,
        "--tp-paper": c.paper,
        "--tp-surface": c.surface,
        "--tp-ink": c.ink,
        "--tp-muted": c.muted,
        "--tp-accent": c.accent,
        "--tp-line": `color-mix(in srgb, ${c.ink} 14%, ${c.paper})`,
        "--tp-heading": template.fonts.heading,
        "--tp-body": template.fonts.body,
        "--tp-radius": u(6),
        display: "block",
        background: c.paper,
        color: c.ink,
        fontFamily: "var(--tp-body)",
        textAlign: "left",
    } as CSSProperties;
    const others = template.pages.filter((p) => p.path !== "/");
    return (
        // The units resolve against the wrapper's width (`cqw` reads the
        // nearest container, never the element itself).
        <span
            aria-hidden
            data-template-preview={template.slug}
            style={{ display: "block", containerType: "inline-size" }}
        >
            <span style={style}>
                <span
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: u(24),
                        padding: `${u(phone ? 16 : 22)} ${u(phone ? 20 : 48)}`,
                        borderBottom: "1px solid var(--tp-line)",
                    }}
                >
                    <span
                        style={{
                            fontFamily: "var(--tp-heading)",
                            fontSize: u(phone ? 18 : 22),
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                        }}
                    >
                        {template.sample.name}
                    </span>
                    {phone ? (
                        <span
                            style={{
                                fontSize: u(14),
                                color: "var(--tp-muted)",
                            }}
                        >
                            Menu
                        </span>
                    ) : (
                        <span
                            style={{
                                display: "flex",
                                gap: u(28),
                                fontSize: u(15),
                                color: "var(--tp-muted)",
                            }}
                        >
                            {others.map((p) => (
                                <span
                                    key={p.path}
                                    style={{
                                        color:
                                            p.path === page.path
                                                ? "var(--tp-ink)"
                                                : undefined,
                                    }}
                                >
                                    {p.title}
                                </span>
                            ))}
                        </span>
                    )}
                </span>
                {page.sections.map((s, i) => (
                    <Section key={i} section={s} phone={phone} />
                ))}
                <span
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: `${u(28)} ${u(phone ? 20 : 48)}`,
                        borderTop: "1px solid var(--tp-line)",
                        fontSize: u(14),
                        color: "var(--tp-muted)",
                    }}
                >
                    <span>{template.sample.name}</span>
                    <span>{template.sample.host}</span>
                </span>
            </span>
        </span>
    );
}
