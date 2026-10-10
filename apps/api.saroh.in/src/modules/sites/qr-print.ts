import { Logger } from "@nestjs/common";
import PDFDocument from "pdfkit";

import type { OpenedImage } from "../invoices/invoice-pdf";
import { loadFonts, openLogo } from "../invoices/invoice-pdf";
import type { LogoPaper } from "../invoices/invoice-pdf-logo";
import { warnLogoSkipped } from "../invoices/invoice-pdf-logo";
import type { QrPrintArt } from "./qr-print-art";
import {
    initialsOf,
    QR_GROUND,
    QR_QUIET_ZONE,
    QR_TILE_FILL,
    QR_TILE_TEXT,
    qrLogoGeometry,
    qrPrintArt,
} from "./qr-print-art";
import type { QrStyle } from "./qr-target";

/**
 * A QR code as a file a print shop can take: a PDF at the real size of the
 * thing it goes on, drawn on request and never stored.
 *
 * - **Real size.** 1 mm is 72 / 25.4 pt. The page is the trim size plus
 *   {@link BLEED_MM} of bleed on every side; `TrimBox` and `BleedBox` say
 *   so to the printer's software.
 * - **Crop marks** are hairlines in the bleed at the four corners, in line
 *   with the trim and stopping {@link MARK_GAP_MM} short of it, so a cut on
 *   the line leaves none on the card. The round sticker also carries its
 *   cut line, a hairline circle in a light magenta a die-cutter reads.
 * - **The code is vectors**: the same squares, dots and eyes the screen
 *   draws (`qr-print-art.ts`), filled in the code's colour, with its quiet
 *   zone of white inside the square it is given. It holds the code's short
 *   link, so paper already printed keeps working when the code is pointed
 *   somewhere new.
 * - **The card** is the "Ready to print" design's: the business name above,
 *   the code, the label below in the code's colour. The visiting card puts
 *   the name and label beside the code. No Saroh name or mark: print files
 *   are on paid plans, which carry no Saroh credit (DEC-102).
 * - **The logo.** A branded code has the logo box. It holds the business
 *   logo when that is a PNG or a JPEG pdfkit can draw, and otherwise the
 *   business's initials on the ink tile, as the screen draws it. The file
 *   never fails over a logo.
 * - **Type** is Noto Sans, embedded (`assets/fonts`). A name or a label
 *   with a letter the face has no glyph for (Devanagari, say) is left off
 *   and logged, since boxes on a printed card are worse than no line.
 */

const logger = new Logger("QrPrint");

/** One millimetre, in points. */
export const MM = 72 / 25.4;
/** Paper past the trim on every side, cut away. */
export const BLEED_MM = 3;
/** How far a crop mark stops short of the trim. */
export const MARK_GAP_MM = 1;

const INK = "#1C1C1A";
const MARK = "#000000";
/** The sticker's cut line: light magenta, the colour die lines are kept in. */
const CUT_GUIDE = "#F28CC4";
const HAIRLINE = 0.25;

export const QR_PRINT_FORMATS = ["standee", "tent", "sticker", "card"] as const;
export type QrPrintFormat = (typeof QR_PRINT_FORMATS)[number];

interface TextSpec {
    /** The type size it starts at and the smallest it steps down to, pt. */
    size: number;
    min: number;
    lines: number;
}

export interface QrPrintSpec {
    /** What a merchant calls it. */
    name: string;
    /** The finished size, in mm. */
    trim: { width: number; height: number };
    /** Cut round: the trim is a circle of `trim.width`. */
    round: boolean;
    /** `stack`: name, code, label down the page. `beside`: text to the right. */
    layout: "stack" | "beside";
    /** Kept clear inside the trim (inside the circle, when round), mm. */
    safe: number;
    /** The code's square, quiet zone included, mm. */
    code: number;
    /** Between the code's square and the text, mm. */
    gap: number;
    title: TextSpec;
    label: TextSpec;
}

export const QR_PRINT_SPECS: Record<QrPrintFormat, QrPrintSpec> = {
    standee: {
        name: "Counter standee",
        trim: { width: 148, height: 210 },
        round: false,
        layout: "stack",
        safe: 10,
        code: 112,
        gap: 5,
        title: { size: 30, min: 16, lines: 2 },
        label: { size: 20, min: 12, lines: 2 },
    },
    tent: {
        name: "Table tent",
        trim: { width: 100, height: 140 },
        round: false,
        layout: "stack",
        safe: 8,
        code: 76,
        gap: 3.5,
        title: { size: 20, min: 11, lines: 2 },
        label: { size: 14, min: 9, lines: 2 },
    },
    sticker: {
        name: "Mirror sticker",
        trim: { width: 60, height: 60 },
        round: true,
        layout: "stack",
        safe: 3,
        code: 32,
        gap: 0.5,
        title: { size: 7.5, min: 5, lines: 1 },
        label: { size: 6.5, min: 4.5, lines: 1 },
    },
    card: {
        name: "Visiting card back",
        trim: { width: 89, height: 51 },
        round: false,
        layout: "beside",
        safe: 4,
        code: 43,
        gap: 2,
        title: { size: 12, min: 8, lines: 3 },
        label: { size: 9, min: 6.5, lines: 2 },
    },
};

/** The page a format is drawn on, in points: the trim plus the bleed. */
export function qrPrintPage(format: QrPrintFormat): {
    width: number;
    height: number;
} {
    const { trim } = QR_PRINT_SPECS[format];
    return {
        width: (trim.width + BLEED_MM * 2) * MM,
        height: (trim.height + BLEED_MM * 2) * MM,
    };
}

/**
 * Where the code's square sits on the trim, in mm from its top left. The
 * square includes the quiet zone, so nothing else is drawn inside it.
 * Stacked formats centre it across; the round sticker centres it both ways
 * and a rectangle moves it up or down to centre the whole card.
 */
export function qrPrintCodeBox(format: QrPrintFormat): {
    x: number;
    /** Null where it depends on how tall the text came out. */
    y: number | null;
    size: number;
} {
    const spec = QR_PRINT_SPECS[format];
    const { trim, code } = spec;
    if (spec.layout === "beside") {
        return { x: spec.safe, y: (trim.height - code) / 2, size: code };
    }
    return {
        x: (trim.width - code) / 2,
        y: spec.round ? (trim.height - code) / 2 : null,
        size: code,
    };
}

/** "Glow Studio", "h7c", "standee" → `glow-studio-qr-h7c-standee.pdf`. */
export function qrPrintFileName(
    business: string,
    code: string,
    format: QrPrintFormat,
): string {
    // As `qrFileName` in `packages/ui/src/lib/qr-art.ts` names a download.
    const slug = (s: string) =>
        s
            .normalize("NFKD")
            .replace(/[̀-ͯ]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
    const parts = [slug(business), "qr", slug(code), format];
    return `${parts.filter((part) => part !== "").join("-")}.pdf`;
}

export interface QrPrintInput {
    format: QrPrintFormat;
    /** The code's short link: what the QR holds. */
    link: string;
    /** The code's short id, for the file's title. */
    code: string;
    style: QrStyle;
    /** "#rrggbb", already checked as dark enough to scan. */
    color: string;
    /** The line under the code; none when null. */
    label: string | null;
    businessName: string;
    /** PNG or JPEG bytes of the business logo; initials when absent. */
    logo?: Buffer | null;
    /** Names the business in a log line. */
    organizationId?: string;
}

/** What went in the code's centre box. `none`: a plain code has no box. */
export type QrPrintLogo = "image" | "initials" | "none";

export interface QrPrintFile {
    file: Buffer;
    logo: QrPrintLogo;
}

/** The log line for a print file that went out with initials instead. */
export const QR_PRINT_LOGO_PAPER: LogoPaper = {
    event: "qr_print_logo_skipped",
    what: "the QR print file went out with initials in place of the business logo",
};

type Doc = PDFKit.PDFDocument;

/** The link is too long for any QR: nothing to print. */
export class QrPrintUnencodable extends Error {}

export function renderQrPrint(input: QrPrintInput): Promise<QrPrintFile> {
    const spec = QR_PRINT_SPECS[input.format];
    const branded = input.style === "BRANDED";
    const art = qrPrintArt(input.link, {
        style: branded ? "branded" : "plain",
        logo: branded,
    });
    if (art.n === 0) throw new QrPrintUnencodable();

    const { regular, bold } = loadFonts();
    const page = qrPrintPage(input.format);
    const doc = new PDFDocument({
        size: [page.width, page.height],
        margin: 0,
        info: {
            Title: `${input.businessName} QR ${input.code} (${spec.name})`,
            // The business's own print, never Saroh's brand (DEC-102).
            Author: input.businessName,
            Creator: input.businessName,
            Producer: input.businessName,
        },
    });
    doc.registerFont("Regular", regular);
    doc.registerFont("Bold", bold);

    const chunks: Buffer[] = [];
    const done = new Promise<Buffer>((resolve, reject) => {
        doc.on("data", (c: Buffer) => chunks.push(c));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);
    });

    const organizationId = input.organizationId ?? "-";
    // Parsed before anything is drawn, so a broken image leaves the page
    // untouched and the tile gets initials.
    const image = branded && input.logo ? openLogo(doc, input.logo) : null;
    if (branded && input.logo && !image) {
        warnLogoSkipped(
            logger,
            organizationId,
            "undecodable",
            QR_PRINT_LOGO_PAPER,
        );
    }

    setBoxes(doc, page);
    drawMarks(doc, spec, page);

    const bleed = BLEED_MM * MM;
    doc.save();
    doc.translate(bleed, bleed);
    const text = (which: "name" | "label", value: string | null) => {
        const clean = value?.replace(/\s+/g, " ").trim() ?? "";
        if (clean === "") return "";
        if (hasGlyphs(doc, clean)) return clean;
        logger.warn(
            `qr_print_text_skipped: a QR print file left off its ${which}, which has letters the embedded font cannot draw (organization ${organizationId})`,
        );
        return "";
    };
    const card: Card = {
        art,
        color: input.color,
        title: text("name", input.businessName),
        label: text("label", input.label),
        image,
        initials: branded ? initialsOf(input.businessName) : "",
    };
    if (spec.layout === "beside") drawBeside(doc, input.format, card);
    else drawStack(doc, input.format, card);
    doc.restore();

    doc.end();
    const logo: QrPrintLogo = !branded ? "none" : image ? "image" : "initials";
    return done.then((file) => ({ file, logo }));
}

// ── The page ────────────────────────────────────────────────────────────

/** Tell the printer's software where the cut is. */
function setBoxes(doc: Doc, page: { width: number; height: number }): void {
    const bleed = BLEED_MM * MM;
    const boxes = (
        doc.page as unknown as { dictionary: { data: Record<string, unknown> } }
    ).dictionary.data;
    boxes.BleedBox = [0, 0, page.width, page.height];
    boxes.TrimBox = [bleed, bleed, page.width - bleed, page.height - bleed];
}

function drawMarks(
    doc: Doc,
    spec: QrPrintSpec,
    page: { width: number; height: number },
): void {
    const bleed = BLEED_MM * MM;
    const reach = (BLEED_MM - MARK_GAP_MM) * MM;
    doc.lineWidth(HAIRLINE).strokeColor(MARK);
    for (const x of [bleed, page.width - bleed]) {
        for (const y of [bleed, page.height - bleed]) {
            // Along the trim's line, from the page's edge toward the corner.
            const fromX = x < page.width / 2 ? 0 : page.width;
            const fromY = y < page.height / 2 ? 0 : page.height;
            doc.moveTo(fromX, y)
                .lineTo(fromX + Math.sign(x - fromX) * reach, y)
                .stroke();
            doc.moveTo(x, fromY)
                .lineTo(x, fromY + Math.sign(y - fromY) * reach)
                .stroke();
        }
    }
    if (spec.round) {
        doc.circle(page.width / 2, page.height / 2, (spec.trim.width / 2) * MM)
            .lineWidth(HAIRLINE)
            .strokeColor(CUT_GUIDE)
            .stroke();
    }
}

// ── The card ────────────────────────────────────────────────────────────

interface Card {
    art: QrPrintArt;
    color: string;
    /** The business name; "" when left off. */
    title: string;
    label: string;
    image: OpenedImage | null;
    initials: string;
}

/** Name, code, label down the page, each centred across it. */
function drawStack(doc: Doc, format: QrPrintFormat, card: Card): void {
    const spec = QR_PRINT_SPECS[format];
    const box = qrPrintCodeBox(format);
    const width = spec.trim.width * MM;
    const height = spec.trim.height * MM;
    const code = box.size * MM;
    const gap = spec.gap * MM;

    // On the round sticker a line is as wide as the circle is there: the
    // chord at the line's far edge, inside the safe margin.
    const radius = (spec.trim.width / 2 - spec.safe) * MM;
    const widthFor = (textHeight: number) => {
        if (!spec.round) return width - spec.safe * 2 * MM;
        const far = code / 2 + gap + textHeight;
        return far >= radius ? 0 : 2 * Math.sqrt(radius ** 2 - far ** 2);
    };
    const title = fitText(doc, card.title, "Bold", spec.title, widthFor);
    const label = fitText(doc, card.label, "Bold", spec.label, widthFor);

    const above = title ? title.height + gap : 0;
    const below = label ? gap + label.height : 0;
    // The sticker keeps the code on the circle's centre; a rectangle
    // centres the whole card.
    const codeY =
        box.y !== null
            ? box.y * MM
            : (height - (above + code + below)) / 2 + above;
    const codeX = box.x * MM;

    if (title) {
        drawText(doc, title, INK, (width - title.width) / 2, codeY - above, {
            align: "center",
        });
    }
    drawCode(doc, card, codeX, codeY, code);
    if (label) {
        drawText(
            doc,
            label,
            card.color,
            (width - label.width) / 2,
            codeY + code + gap,
            { align: "center" },
        );
    }
}

/** The code on the left, the name and label beside it. */
function drawBeside(doc: Doc, format: QrPrintFormat, card: Card): void {
    const spec = QR_PRINT_SPECS[format];
    const box = qrPrintCodeBox(format);
    const height = spec.trim.height * MM;
    const code = box.size * MM;
    const x = box.x * MM;
    drawCode(doc, card, x, (box.y ?? 0) * MM, code);

    const textX = x + code + spec.gap * MM;
    const width = (spec.trim.width - spec.safe) * MM - textX;
    const title = fitText(doc, card.title, "Bold", spec.title, () => width);
    const label = fitText(doc, card.label, "Bold", spec.label, () => width);
    const between = title && label ? spec.gap * MM : 0;
    const total = (title?.height ?? 0) + between + (label?.height ?? 0);
    let y = (height - total) / 2;
    if (title) {
        drawText(doc, title, INK, textX, y, { align: "left" });
        y += title.height + between;
    }
    if (label) drawText(doc, label, card.color, textX, y, { align: "left" });
}

/** The code, quiet zone included, in a square of `side` points. */
function drawCode(
    doc: Doc,
    card: Card,
    x: number,
    y: number,
    side: number,
): void {
    const { art } = card;
    const scale = side / (art.n + QR_QUIET_ZONE * 2);
    doc.save();
    doc.translate(x, y).scale(scale).translate(QR_QUIET_ZONE, QR_QUIET_ZONE);
    // From here one unit is one module, as the art's paths are written.
    doc.path(art.dots).fill(card.color);
    doc.path(art.eyes).fill(card.color, "even-odd");

    const g = qrLogoGeometry(art);
    if (g) {
        doc.roundedRect(
            g.box.x,
            g.box.y,
            g.box.size,
            g.box.size,
            g.box.rx,
        ).fill(QR_GROUND);
        const { tile } = g;
        if (card.image) {
            doc.save();
            doc.roundedRect(
                tile.x,
                tile.y,
                tile.size,
                tile.size,
                tile.imageRx,
            ).clip();
            // pdfkit draws an already-opened image as it draws bytes.
            doc.image(card.image as unknown as Buffer, tile.x, tile.y, {
                fit: [tile.size, tile.size],
                align: "center",
                valign: "center",
            });
            doc.restore();
        } else {
            doc.roundedRect(tile.x, tile.y, tile.size, tile.size, tile.rx).fill(
                QR_TILE_FILL,
            );
            doc.font("Bold").fontSize(g.text.size);
            if (card.initials !== "" && hasGlyphs(doc, card.initials)) {
                const w = doc.widthOfString(card.initials);
                doc.fillColor(QR_TILE_TEXT).text(
                    card.initials,
                    g.text.x - w / 2,
                    g.text.y - doc.currentLineHeight() / 2,
                    { lineBreak: false },
                );
            }
        }
    }
    doc.restore();
}

// ── Type ────────────────────────────────────────────────────────────────

interface TextBlock {
    text: string;
    font: string;
    size: number;
    width: number;
    height: number;
}

/** Whether the embedded face can draw every letter of `text`. */
function hasGlyphs(doc: Doc, text: string): boolean {
    doc.font("Bold");
    const font = (
        doc as unknown as {
            _font?: {
                font?: { hasGlyphForCodePoint?: (code: number) => boolean };
            };
        }
    )._font?.font;
    if (typeof font?.hasGlyphForCodePoint !== "function") return true;
    return Array.from(text).every((ch) => {
        const code = ch.codePointAt(0);
        return (
            /\s/.test(ch) ||
            (code !== undefined && font.hasGlyphForCodePoint?.(code) === true)
        );
    });
}

/**
 * `text` set to fit: at the spec's size when it fits its lines, stepping
 * the type down to the smallest when it doesn't, and cut short with "…"
 * when even that is too long. Null for no text, or no room.
 */
function fitText(
    doc: Doc,
    text: string,
    font: string,
    spec: TextSpec,
    widthFor: (textHeight: number) => number,
): TextBlock | null {
    if (text === "") return null;
    doc.font(font);
    const fits = (value: string, width: number, room: number) =>
        value.split(" ").every((word) => doc.widthOfString(word) <= width) &&
        doc.heightOfString(value, { width }) <= room + 0.01;

    for (let size = spec.size; ; size = Math.max(spec.min, size - 0.5)) {
        doc.fontSize(size);
        const room = doc.currentLineHeight() * spec.lines;
        const width = widthFor(room);
        if (width <= 0) return null;
        let value = text;
        if (!fits(value, width, room)) {
            if (size > spec.min) continue;
            const letters = Array.from(text);
            while (letters.length > 1) {
                letters.pop();
                value = `${letters.join("").trimEnd()}…`;
                if (fits(value, width, room)) break;
            }
        }
        return {
            text: value,
            font,
            size,
            width,
            height: doc.heightOfString(value, { width }),
        };
    }
}

function drawText(
    doc: Doc,
    block: TextBlock,
    color: string,
    x: number,
    y: number,
    options: { align: "left" | "center" },
): void {
    doc.font(block.font)
        .fontSize(block.size)
        .fillColor(color)
        .text(block.text, x, y, { width: block.width, align: options.align });
}
