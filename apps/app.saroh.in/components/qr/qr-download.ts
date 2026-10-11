import type { QrArt, QrSvgLogo } from "@saroh/ui/lib/qr-art";
import {
    QR_EXPORT_SIZE,
    QR_GROUND,
    qrArt,
    qrFileName,
    qrSvg,
} from "@saroh/ui/lib/qr-art";

import type { QrCodeView, QrStyle } from "@/lib/qr/types";

/**
 * A saved code as a file: the SVG string from `qrSvg`, and a 1200×1200 PNG
 * drawn from that same SVG on a canvas, so the two can't differ.
 *
 * Only a saved code is ever turned into a file: `qrFile` takes the code's
 * own short link, which the server knows, never a preview's sample. The
 * logo is a `data:` URL (the app's server fetched its bytes), so the file
 * points at nothing outside itself.
 */

export type QrFormat = "png" | "svg";

/** The logo a branded code carries: the image, or the initials tile. */
export interface QrLogoChoice {
    /** The logo as a `data:` URL; null: none, so the initials stand in. */
    dataUrl: string | null;
    initials: string;
}

/** How a code is drawn: plain squares, or dots with the logo box. */
export function artOf(text: string, style: QrStyle): QrArt {
    const branded = style === "BRANDED";
    return qrArt(text, { style: branded ? "branded" : "plain", logo: branded });
}

/** The logo for `qrSvg`, or none for a plain code. */
export function svgLogoOf(
    style: QrStyle,
    logo: QrLogoChoice,
): QrSvgLogo | undefined {
    if (style !== "BRANDED") return undefined;
    return logo.dataUrl
        ? { dataUrl: logo.dataUrl }
        : { initials: logo.initials };
}

export interface QrFile {
    /** Without the extension: `glow-studio-qr-h7c`. */
    name: string;
    svg: string;
}

/**
 * The file for a saved code, in the look it was saved with. Null for a code
 * with no link (a site with no address): there is nothing to encode.
 */
export function qrFile(
    code: Pick<QrCodeView, "code" | "link" | "style" | "color" | "label">,
    business: string,
    logo: QrLogoChoice,
): QrFile | null {
    if (!code.link) return null;
    const art = artOf(code.link, code.style);
    if (art.n === 0) return null;
    return {
        name: qrFileName(business, code.code),
        svg: qrSvg(art, {
            color: code.color,
            logo: svgLogoOf(code.style, logo),
            label: code.label ?? undefined,
        }),
    };
}

/** What the browser gives a download; replaced in tests. */
export interface DownloadEnv {
    /** Draw the SVG onto a square canvas and hand back the PNG. */
    rasterise: (svg: string, size: number) => Promise<Blob>;
    /** Hand the file to the browser's downloads. */
    save: (blob: Blob, filename: string) => void;
}

function rasterise(svg: string, size: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(
            new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
        );
        const done = () => URL.revokeObjectURL(url);
        const image = new Image();
        image.onerror = () => {
            done();
            reject(new Error("The code could not be drawn"));
        };
        const draw = () => {
            const canvas = document.createElement("canvas");
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
                done();
                reject(new Error("No canvas"));
                return;
            }
            ctx.fillStyle = QR_GROUND;
            ctx.fillRect(0, 0, size, size);
            ctx.drawImage(image, 0, 0, size, size);
            canvas.toBlob((blob) => {
                done();
                if (blob) resolve(blob);
                else reject(new Error("The picture could not be made"));
            }, "image/png");
        };
        image.onload = () => {
            // `decode` waits for a logo embedded in the SVG, which some
            // browsers haven't drawn yet at `load`.
            const ready =
                typeof image.decode === "function"
                    ? image.decode().catch(() => undefined)
                    : Promise.resolve();
            void ready.then(draw);
        };
        image.src = url;
    });
}

function save(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    // After the click has been taken, so the download isn't cut off.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const BROWSER: DownloadEnv = { rasterise, save };

/** Download `file` as a PNG (1200×1200) or the SVG itself. */
export async function downloadQr(
    file: QrFile,
    format: QrFormat,
    env: DownloadEnv = BROWSER,
): Promise<void> {
    if (format === "svg") {
        env.save(
            new Blob([file.svg], { type: "image/svg+xml;charset=utf-8" }),
            `${file.name}.svg`,
        );
        return;
    }
    env.save(await env.rasterise(file.svg, QR_EXPORT_SIZE), `${file.name}.png`);
}
