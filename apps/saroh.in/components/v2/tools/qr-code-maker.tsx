"use client";

import {
    QR_EXPORT_SIZE,
    QR_GROUND,
    qrArt,
    qrSvg,
    tooLightToScan,
} from "@saroh/ui/lib/qr-art";
import { QrArt } from "@saroh/ui/qr-art";
import { useCallback, useId, useMemo, useState } from "react";

import { qrCodeMaker as copy } from "@/content/qr-code-maker";
import type { QrUnlockResult } from "@/lib/qr-code-maker";
import {
    logoProblem,
    QR_DEFAULT_COLOUR,
    QR_LABEL_MAX,
    QR_SAMPLE_LINK,
    QR_SWATCHES,
    qrLink,
    typedLink,
} from "@/lib/qr-code-maker";

import { readAsDataUrl, saveFile, svgBlob, svgToPng } from "./qr-download";
import type { QrUnlocked } from "./qr-maker-gate";
import { QrMakerGate } from "./qr-maker-gate";

const FOCUS =
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid]";
const FOCUS_WITHIN =
    "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand-500 focus-within:[outline-style:solid]";
const FIELD_NAME = "text-sm font-semibold";

/**
 * The QR code maker (QR codes plan U9; design "Saroh QR Codes", screen 02):
 * a link, a logo, a colour and a label on the left, the live code on the
 * right, and under it the email gate or the downloads.
 *
 * Everything about the code happens in this component: it is drawn from
 * what is typed (`@saroh/ui/lib/qr-art`), the logo is read with FileReader
 * and never uploaded, and the PNG and SVG are made here. The one call the
 * page makes is the email gate's, and its body is the email alone.
 */
export function QrCodeMaker() {
    const [rest, setRest] = useState("");
    const [scheme, setScheme] = useState<"https" | "http">("https");
    const [colour, setColour] = useState<string>(QR_DEFAULT_COLOUR);
    const [label, setLabel] = useState("");
    const [logo, setLogo] = useState<string | null>(null);
    const [logoError, setLogoError] = useState<string | null>(null);
    const [unlocked, setUnlocked] = useState<QrUnlocked | null>(null);
    const [pending, setPending] = useState(false);
    const [gateError, setGateError] = useState<string | null>(null);
    const [pngError, setPngError] = useState<string | null>(null);
    const colourId = useId();
    const logoId = useId();

    const link = qrLink(scheme, rest);
    const art = useMemo(
        () => qrArt(link || QR_SAMPLE_LINK, { style: "branded", logo: true }),
        [link],
    );
    const tooLong = link !== "" && art.n === 0;
    const tooLight = tooLightToScan(colour);
    const pill = label.trim();

    // Why there is nothing to download, said by the buttons. A link too
    // long for a code has its own alert under the code, so it adds none.
    const blocked = !link
        ? copy.downloads.needLink
        : tooLong
          ? ""
          : tooLight
            ? copy.downloads.needColour
            : null;

    const unlock = useCallback(async (email: string) => {
        setPending(true);
        setGateError(null);
        try {
            // The email, and nothing about the code.
            const res = await fetch("/api/qr-code-maker/unlock", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            });
            const body = (await res.json()) as QrUnlockResult;
            if (body.unlocked) {
                setUnlocked(body);
            } else {
                setGateError(
                    body.failure === "bad-email"
                        ? copy.gate.badEmail
                        : body.failure === "rate-limited"
                          ? copy.gate.rateLimited
                          : copy.gate.failed,
                );
            }
        } catch {
            setGateError(copy.gate.failed);
        } finally {
            setPending(false);
        }
    }, []);

    async function chooseLogo(file: File | undefined) {
        if (!file) return;
        const problem = logoProblem(file);
        if (problem) {
            setLogoError(
                problem === "too-big" ? copy.logo.tooBig : copy.logo.notPicture,
            );
            return;
        }
        try {
            // Read here, in the page: the file is never uploaded.
            setLogo(await readAsDataUrl(file));
            setLogoError(null);
        } catch {
            setLogoError(copy.logo.unreadable);
        }
    }

    const fileSvg = () =>
        qrSvg(art, {
            color: colour,
            logo: logo ? { dataUrl: logo } : undefined,
            label: pill || undefined,
        });

    function downloadSvg() {
        setPngError(null);
        saveFile(svgBlob(fileSvg()), `${copy.downloads.fileName}.svg`);
    }

    async function downloadPng() {
        setPngError(null);
        try {
            const png = await svgToPng(fileSvg(), QR_EXPORT_SIZE);
            saveFile(png, `${copy.downloads.fileName}.png`);
        } catch {
            setPngError(copy.downloads.pngFailed);
        }
    }

    return (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] items-start gap-7">
            <div className="flex min-w-0 flex-col gap-5">
                <label className="flex flex-col gap-2">
                    <span className={FIELD_NAME}>{copy.link.label}</span>
                    <span
                        className={`flex h-[54px] overflow-hidden rounded-xl border-2 border-foreground bg-card ${FOCUS_WITHIN}`}
                    >
                        <span
                            aria-hidden
                            data-scheme
                            className="flex items-center pl-3.5 font-mono text-sm text-muted-foreground"
                        >
                            {scheme}://
                        </span>
                        <input
                            type="text"
                            inputMode="url"
                            autoComplete="url"
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            aria-label={copy.link.field}
                            placeholder={copy.link.placeholder}
                            value={rest}
                            onChange={(event) => {
                                const next = typedLink(
                                    event.target.value,
                                    scheme,
                                );
                                setRest(next.rest);
                                setScheme(next.scheme);
                            }}
                            className="min-w-0 flex-1 border-none bg-transparent px-2 font-mono text-[15px] text-foreground outline-none placeholder:text-mk-hint"
                        />
                    </span>
                </label>

                <div className="flex flex-col gap-2">
                    <span id={logoId} className={FIELD_NAME}>
                        {copy.logo.label}
                    </span>
                    <div
                        role="group"
                        aria-labelledby={logoId}
                        className="flex flex-wrap items-center gap-3"
                    >
                        <label
                            className={`flex h-[42px] cursor-pointer items-center rounded-[10px] border border-border-strong bg-card px-4 text-sm font-semibold transition-colors duration-fast ease-out hover:bg-mk-hover active:bg-muted ${FOCUS_WITHIN}`}
                        >
                            {logo ? copy.logo.change : copy.logo.add}
                            <input
                                type="file"
                                accept="image/*"
                                className="sr-only"
                                onChange={(event) => {
                                    void chooseLogo(event.target.files?.[0]);
                                    // The same file can be chosen again.
                                    event.target.value = "";
                                }}
                            />
                        </label>
                        <span className="min-w-0 flex-[1_1_220px] text-[13px] text-muted-foreground">
                            {copy.logo.note}
                        </span>
                    </div>
                    {logoError ? (
                        <span role="alert" className="text-[13px] text-mk-bad">
                            {logoError}
                        </span>
                    ) : null}
                </div>

                <div className="flex flex-col gap-2">
                    <span id={colourId} className={FIELD_NAME}>
                        {copy.colour.label}
                    </span>
                    <div
                        role="group"
                        aria-labelledby={colourId}
                        className="flex flex-wrap gap-2.5"
                    >
                        {QR_SWATCHES.map((swatch) => {
                            const on = swatch.hex === colour;
                            return (
                                <button
                                    key={swatch.hex}
                                    type="button"
                                    aria-label={swatch.name}
                                    aria-pressed={on}
                                    data-swatch={swatch.hex}
                                    onClick={() => setColour(swatch.hex)}
                                    // The swatch is the code's own ink, not
                                    // a page colour: it has no token.
                                    style={{ backgroundColor: swatch.hex }}
                                    className={`size-[34px] cursor-pointer rounded-full border-[3px] border-background ring-[1.5px] transition-transform duration-fast ease-out hover:scale-105 active:scale-95 ${
                                        on ? "ring-foreground" : "ring-border"
                                    } ${FOCUS} focus-visible:outline-offset-[3px]`}
                                />
                            );
                        })}
                    </div>
                    {tooLight ? (
                        <span role="alert" className="text-[13px] text-mk-bad">
                            {copy.colour.tooLight}
                        </span>
                    ) : null}
                </div>

                <label className="flex flex-col gap-2">
                    <span className={FIELD_NAME}>{copy.label.label}</span>
                    <input
                        type="text"
                        maxLength={QR_LABEL_MAX}
                        placeholder={copy.label.placeholder}
                        value={label}
                        onChange={(event) => setLabel(event.target.value)}
                        className={`h-[46px] rounded-[10px] border border-border-strong bg-card px-3.5 text-[15px] text-foreground placeholder:text-mk-hint ${FOCUS}`}
                    />
                </label>
            </div>

            <div className="flex min-w-0 flex-col items-center gap-4 rounded-[18px] border border-border bg-card p-7">
                <div className="relative aspect-square w-full max-w-[300px]">
                    <QrArt
                        art={art}
                        color={colour}
                        logo={logo ? { src: logo } : undefined}
                        aria-label={
                            link
                                ? copy.preview.alt(link)
                                : copy.preview.sampleAlt
                        }
                        className="size-full"
                    />
                    {!logo && art.logoBox ? (
                        <div
                            aria-hidden
                            className="pointer-events-none absolute inset-0 flex items-center justify-center"
                        >
                            {/* The box's and the tile's share of the code are the renderer's numbers. */}
                            <div
                                style={{ width: `${art.boxPct}%` }}
                                className="flex aspect-square items-center justify-center"
                            >
                                <span
                                    data-logo-placeholder
                                    style={{ width: `${art.tilePct}%` }}
                                    className="flex aspect-square items-center justify-center rounded-[22%] border-[1.5px] border-dashed border-border-strong text-[11px] text-mk-hint"
                                >
                                    {copy.logo.placeholder}
                                </span>
                            </div>
                        </div>
                    ) : null}
                </div>
                {pill ? (
                    <span
                        data-qr-label
                        // The pill is part of the code: its ink, on the code's white.
                        style={{ backgroundColor: colour, color: QR_GROUND }}
                        className="max-w-full rounded-full px-[18px] py-2 text-center font-display text-xl font-semibold [overflow-wrap:anywhere]"
                    >
                        {pill}
                    </span>
                ) : null}
                {!link ? (
                    <span className="text-center text-[13px] text-muted-foreground">
                        {copy.preview.sample}
                    </span>
                ) : null}
                {tooLong ? (
                    <span
                        role="alert"
                        className="text-center text-[13px] text-mk-bad"
                    >
                        {copy.preview.tooLong}
                    </span>
                ) : null}

                <QrMakerGate
                    unlocked={unlocked}
                    pending={pending}
                    error={gateError}
                    onUnlock={(email) => void unlock(email)}
                    blocked={blocked}
                    pngError={pngError}
                    onPng={() => void downloadPng()}
                    onSvg={downloadSvg}
                />
            </div>
        </div>
    );
}
