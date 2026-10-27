import jsQR from "jsqr";

import { qrModules, qrSvg } from "./tools/qr";

/**
 * For tests: draws `text` with the QR tools' own encoder and reads it back
 * with a real decoder (jsQR, the strict one the QR code maker's tests use).
 * So a test pins what a phone camera would read, not only the string.
 */
export function decodeQr(text: string): string | null {
    const m = qrModules(text);
    if (!m) return null;
    const cell = 4;
    const px = m.length * cell;
    const data = new Uint8ClampedArray(px * px * 4);
    for (let y = 0; y < px; y++)
        for (let x = 0; x < px; x++) {
            const v = m[Math.floor(y / cell)]?.[Math.floor(x / cell)] ? 0 : 255;
            const i = (y * px + x) * 4;
            data[i] = data[i + 1] = data[i + 2] = v;
            data[i + 3] = 255;
        }
    return jsQR(data, px, px)?.data ?? null;
}

/** The path a drawn code of `text` has, to compare with what a tool drew. */
export function pathFor(text: string): string | null {
    return /<path d="([^"]*)"/.exec(qrSvg(text) ?? "")?.[1] ?? null;
}

/** The path of the QR code drawn under `root` with this accessible name. */
export function drawnPath(root: HTMLElement, label: string): string | null {
    const svg = [...root.querySelectorAll('svg[role="img"]')].find(
        (s) => s.getAttribute("aria-label") === label,
    );
    return svg?.querySelector("path")?.getAttribute("d") ?? null;
}
