"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { encode } from "uqr";

import { saveFile } from "./download";

/**
 * What the QR tools share (UPI, Google review, menu, Wi-Fi, business card):
 * the code drawn as an SVG and saved as a PNG, both in the browser with the
 * same library as the QR code maker (`uqr`). Medium error correction: these
 * codes carry no logo, so the extra room goes to a less dense code.
 * Nothing here calls the network.
 */

/** Quiet modules around the code, as the QR spec asks. */
const QUIET = 4;

/** The code's modules (true = dark), with the quiet zone; null when it doesn't fit any QR. */
export function qrModules(text: string): boolean[][] | null {
    if (!text) return null;
    try {
        return encode(text, { ecc: "M", border: QUIET }).data;
    } catch {
        // uqr throws when the text does not fit version 40.
        return null;
    }
}

/** One SVG path for every dark module. */
function pathOf(m: boolean[][]): string {
    let d = "";
    m.forEach((row, y) =>
        row.forEach((on, x) => {
            if (on) d += `M${x} ${y}h1v1h-1z`;
        }),
    );
    return d;
}

/** The code as an SVG file, `px` wide, ink on white. */
export function qrSvg(text: string, px = 1200): string | null {
    const m = qrModules(text);
    if (!m) return null;
    const n = m.length;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#FFFFFF"/><path d="${pathOf(m)}" fill="#1C1C1A"/></svg>`;
}

/** The code on screen. `faded` draws the sample a first visit sees. */
export function QrCode({
    text,
    label,
    faded,
}: {
    text: string;
    /** What scanning it does, for a screen reader. */
    label: string;
    faded?: boolean;
}) {
    const m = qrModules(text);
    if (!m) return null;
    const n = m.length;
    return (
        <svg
            role="img"
            aria-label={label}
            viewBox={`0 0 ${n} ${n}`}
            shapeRendering="crispEdges"
            className={`qc-code ${faded ? "qc-faded" : ""}`}
        >
            <rect width={n} height={n} fill="#FFFFFF" />
            <path d={pathOf(m)} fill="#1C1C1A" />
        </svg>
    );
}

/** The code as a PNG, drawn on a canvas from its modules. Rejects when the browser can't. */
export function qrPng(text: string, px = 1200): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const m = qrModules(text);
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!m || !ctx) {
            reject(new Error("no PNG"));
            return;
        }
        const n = m.length;
        const cell = Math.max(1, Math.floor(px / n));
        canvas.width = canvas.height = cell * n;
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#1C1C1A";
        m.forEach((row, y) =>
            row.forEach((on, x) => {
                if (on) ctx.fillRect(x * cell, y * cell, cell, cell);
            }),
        );
        canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error("no PNG"))),
            "image/png",
        );
    });
}

/** Save the code as `<name>.png`; false when the browser couldn't make it. */
export async function downloadQrPng(
    text: string,
    name: string,
): Promise<boolean> {
    try {
        saveFile(await qrPng(text), `${name}.png`);
        return true;
    } catch {
        return false;
    }
}

/**
 * What to draw: what they typed when it's good, the last good one while a
 * field is wrong (`holding`), else null (the sample). `key` tells two
 * values apart (the payload a code holds).
 */
export function useLastGood<T>(
    now: T | null,
    holding: boolean,
    key: (value: T) => string = String,
): T | null {
    const [last, setLast] = useState<{ k: string; v: T } | null>(null);
    if (now !== null && last?.k !== key(now)) setLast({ k: key(now), v: now });
    return now ?? (holding ? (last?.v ?? null) : null);
}

/** A full web address: http(s), a host with a dot, no spaces. */
export function isLink(value: string): boolean {
    const v = value.trim();
    if (!/^https?:\/\/\S+$/i.test(v)) return false;
    try {
        return new URL(v).hostname.includes(".");
    } catch {
        return false;
    }
}

/** The white card a QR tool draws its code on (eyebrow, the code, a title, a line in mono, a check line). */
export function QrCard({
    eyebrow,
    code,
    title,
    mono,
    check,
    children,
    label,
}: {
    eyebrow: string;
    code: ReactNode;
    title?: ReactNode;
    mono?: string;
    check?: ReactNode;
    children?: ReactNode;
    /** The card's name, for a screen reader. */
    label: string;
}) {
    return (
        <section aria-label={label} className="qc-card">
            <span className="qc-eyebrow">{eyebrow}</span>
            {code}
            {title ? <span className="qc-title">{title}</span> : null}
            {mono ? <span className="qc-mono">{mono}</span> : null}
            {children}
            {check ? <span className="qc-check">{check}</span> : null}
        </section>
    );
}

/** The faded sample a first visit sees, and the line under it. */
export function QrSample({ line }: { line: string }) {
    return (
        <div className="qc-sample">
            <QrCode text="Sample" label="A sample QR code" faded />
            <span className="qc-sample-line">{line}</span>
        </div>
    );
}

/** The downloads the email gate opens, and what went wrong with one. */
export function Downloads({
    children,
    error,
}: {
    children: ReactNode;
    error?: string | null;
}) {
    return (
        <div className="qc-downloads">
            {children}
            {error ? (
                <span role="alert" className="tp-error">
                    {error}
                </span>
            ) : null}
        </div>
    );
}

export const PNG_FAILED =
    "This browser couldn't make the PNG. Try Print, or another browser.";

/** A download button that says it worked. */
export function DownloadButton({
    children,
    done,
    onClick,
}: {
    children: ReactNode;
    done?: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            className={`tp-btn tp-btn-wide ${done ? "qc-done" : ""}`}
            onClick={onClick}
        >
            {done ? <span aria-hidden="true">✓ </span> : null}
            {children}
        </button>
    );
}
