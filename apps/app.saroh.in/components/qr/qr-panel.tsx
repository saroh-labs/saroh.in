"use client";

import { Button } from "@saroh/ui/button";
import { qrFileName, qrSvg } from "@saroh/ui/lib/qr-art";
import type { QrArtLogo } from "@saroh/ui/qr-art";
import { QrArt } from "@saroh/ui/qr-art";
import { showError } from "@saroh/ui/toast";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { makeQrPanelCode, openQrPanel } from "@/lib/qr/actions";
import { QR_INK } from "@/lib/qr/colours";
import type { QrLink, QrPanelRead, QrSavedLink } from "@/lib/qr/panel";
import { instantOpens, NOT_COUNTED, QR_SHARE_HREF } from "@/lib/qr/panel";
import type { QrCodeView } from "@/lib/qr/types";
import { linkWords, opensWords, refusalWords } from "@/lib/qr/words";

import type { DownloadEnv, QrFile, QrFormat } from "./qr-download";
import { artOf, BROWSER, downloadQr, qrFile } from "./qr-download";

const linkClass =
    "rounded-[4px] font-semibold text-brand underline underline-offset-2 transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:text-muted-foreground";

const NOTE = "text-[13px] leading-normal text-foreground/80";

/** A panel's read with a code in it: kept, so a second open is at once. */
export function hasCode(
    read: QrPanelRead | null,
): read is Extract<QrPanelRead, { state: "ready" }> & { code: QrCodeView } {
    return read?.state === "ready" && read.code !== null;
}

/**
 * What a QR button opens (plan U7, DEC-118): the code, the link it holds,
 * Download PNG and SVG, Copy link. Everything a merchant came for is done
 * here; "More options" is only the way to the rest (its look, its place,
 * its scans), never a step on the way to a code.
 *
 * - **A saved link** (the website, the shop, the booking page, a product):
 *   the panel reads the code that target already has and draws it from its
 *   short link. With none yet, someone who may make one (`site:update`)
 *   is offered "Make this code", an explicit press: opening a panel never
 *   writes. Someone who may not gets a QR of the public link, and is told
 *   it isn't counted.
 * - **An instant link** (a pay link, a draft's preview): drawn in the
 *   browser from the link itself. Nothing is read or saved.
 *
 * A read that failed says so and offers it again; it is never shown as
 * "no code yet".
 */
export function QrPanel({
    link,
    known = null,
    onKnown,
    env = BROWSER,
}: {
    link: QrLink;
    /** What an earlier open of this button read. */
    known?: QrPanelRead | null;
    onKnown?: (read: QrPanelRead) => void;
    /** Replaced in tests; the browser's own otherwise. */
    env?: DownloadEnv;
}) {
    if (link.mode === "instant") {
        return (
            <Drawn
                text={link.url}
                fileName={link.fileName}
                label={`QR code for ${link.what}`}
                env={env}
            >
                <p className={NOTE}>{instantOpens(link.opens)}</p>
                <p data-qr-not-counted="" className={NOTE}>
                    {NOT_COUNTED}
                </p>
            </Drawn>
        );
    }
    return <Saved link={link} known={known} onKnown={onKnown} env={env} />;
}

function Saved({
    link,
    known,
    onKnown,
    env,
}: {
    link: QrSavedLink;
    known: QrPanelRead | null;
    onKnown?: (read: QrPanelRead) => void;
    env: DownloadEnv;
}) {
    // Only a read that found a code is reused: anything else is asked again.
    const [read, setRead] = useState<QrPanelRead | null>(
        hasCode(known) ? known : null,
    );
    const [attempt, setAttempt] = useState(0);
    const [making, setMaking] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);
    const { kind, ref, siteId, from } = link;
    const settled = read !== null;

    useEffect(() => {
        if (settled) return;
        let gone = false;
        void openQrPanel({ kind, ref, siteId, from })
            .catch((): QrPanelRead => ({ state: "failed" }))
            .then((next) => {
                if (gone) return;
                setRead(next);
                onKnown?.(next);
            });
        return () => {
            gone = true;
        };
        // `attempt` asks again after a failure; `onKnown` is the caller's.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [settled, attempt, kind, ref, siteId, from]);

    async function make(at: Extract<QrPanelRead, { state: "ready" }>) {
        if (making) return;
        setMaking(true);
        setProblem(null);
        try {
            const res = await makeQrPanelCode(at.siteId, { kind, ref, from });
            if (!res.ok) {
                setProblem(refusalWords(res).text);
                return;
            }
            const next: QrPanelRead = { ...at, code: res.data };
            setRead(next);
            onKnown?.(next);
        } catch {
            setProblem("We couldn't make that code. Try again.");
        } finally {
            setMaking(false);
        }
    }

    if (read === null) {
        return (
            <p role="status" aria-busy="true" className={NOTE}>
                Finding this code…
            </p>
        );
    }
    if (read.state === "failed") {
        return (
            <div className="flex flex-col items-start gap-2.5">
                <p role="alert" className={NOTE}>
                    We couldn&apos;t load this QR code. Nothing was changed.
                </p>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                        setRead(null);
                        setAttempt((n) => n + 1);
                    }}
                >
                    Try again
                </Button>
            </div>
        );
    }
    if (read.state === "unavailable") {
        return (
            <Drawn
                text={link.url}
                fileName={qrFileName(link.what)}
                label={`QR code for ${link.what}`}
                env={env}
            >
                <p data-qr-not-counted="" className={NOTE}>
                    {NOT_COUNTED}
                </p>
            </Drawn>
        );
    }

    const notLive = !read.live ? (
        <p data-qr-not-live="" className={NOTE}>
            Your site isn&apos;t published yet. This link works once it is.
        </p>
    ) : null;
    const more = (
        <Link href={QR_SHARE_HREF} className={linkClass}>
            More options
        </Link>
    );

    const { code } = read;
    if (code) {
        if (!code.link) {
            return (
                <p role="note" className={NOTE}>
                    Your site has no web address yet, so this code has no link
                    to hold.
                </p>
            );
        }
        const logo = {
            dataUrl: read.business.logo,
            initials: read.business.initials,
        };
        return (
            <Drawn
                text={code.link}
                code={code}
                file={qrFile(code, read.business.name, logo)}
                logo={
                    code.style !== "BRANDED"
                        ? undefined
                        : logo.dataUrl
                          ? { src: logo.dataUrl }
                          : { initials: logo.initials }
                }
                label={`QR code that opens ${opensWords(code)}`}
                env={env}
                footer={
                    <p className="text-[13px] text-muted-foreground">
                        Its look, where it is placed and its scans: {more}
                    </p>
                }
            >
                <p className={NOTE}>
                    Opens {opensWords(code)}. You can point it somewhere new
                    later without reprinting.
                </p>
                {notLive}
            </Drawn>
        );
    }

    if (read.canChange) {
        return (
            <div data-qr-panel="make" className="flex flex-col gap-3">
                <p className={NOTE}>
                    No QR code for {link.what} yet. Making one gives it a short
                    link of its own, so you can point it somewhere new later
                    without reprinting.
                </p>
                {notLive}
                {problem ? (
                    <p
                        role="alert"
                        className="rounded-[9px] bg-destructive-subtle px-3 py-2 text-[13px] text-destructive-subtle-foreground"
                    >
                        {problem}
                    </p>
                ) : null}
                <div>
                    <Button
                        type="button"
                        disabled={making}
                        onClick={() => void make(read)}
                    >
                        <span aria-live="polite">
                            {making ? "Making the code…" : "Make this code"}
                        </span>
                    </Button>
                </div>
            </div>
        );
    }

    // May look, may not make, and nobody has made one: the public link.
    return (
        <Drawn
            text={link.url}
            fileName={qrFileName(link.what)}
            label={`QR code for ${link.what}`}
            env={env}
            footer={
                <p className="text-[13px] text-muted-foreground">
                    Saved codes are in Settings › Share: {more}
                </p>
            }
        >
            <p data-qr-not-counted="" className={NOTE}>
                Not counted. This is a QR of the link itself; an owner or admin
                can make a saved code that counts its scans.
            </p>
            {notLive}
        </Drawn>
    );
}

/**
 * A code on screen with its link and its three buttons. A saved code is
 * drawn in its own look and its file is the one Settings › Share gives
 * (`qrFile`); anything else is plain ink, drawn from the link itself.
 */
function Drawn({
    text,
    code,
    file,
    fileName,
    logo,
    label,
    env,
    footer,
    children,
}: {
    /** What is encoded and what Copy link copies. */
    text: string;
    /** The saved code, when it is one. */
    code?: QrCodeView;
    file?: QrFile | null;
    /** An instant QR's download name, without the extension. */
    fileName?: string;
    logo?: QrArtLogo;
    label: string;
    env: DownloadEnv;
    footer?: React.ReactNode;
    children?: React.ReactNode;
}) {
    const style = code?.style ?? "PLAIN";
    const color = code?.color ?? QR_INK;
    const art = useMemo(() => artOf(text, style), [text, style]);
    const [busy, setBusy] = useState<QrFormat | null>(null);
    const [copied, setCopied] = useState(false);
    const drawable = art.n > 0;

    async function download(format: QrFormat) {
        if (busy || !drawable) return;
        const made: QrFile | null =
            file ??
            (code
                ? null
                : { name: fileName ?? "qr-code", svg: qrSvg(art, { color }) });
        if (!made) return;
        setBusy(format);
        try {
            await downloadQr(made, format, env);
        } catch {
            showError(
                format === "png"
                    ? "Couldn't make the PNG. Try again, or download the SVG."
                    : "Couldn't make the file. Try again.",
            );
        } finally {
            setBusy(null);
        }
    }

    async function copy() {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
        } catch {
            showError(
                "Couldn't copy the link. Select it and copy it instead.",
                text,
            );
        }
    }

    return (
        <div
            data-qr-panel={code ? "code" : "instant"}
            className="flex min-w-0 flex-col gap-3"
        >
            {drawable ? (
                <div className="mx-auto w-full max-w-[180px]">
                    <QrArt
                        art={art}
                        color={color}
                        logo={logo}
                        aria-label={label}
                    />
                </div>
            ) : (
                <p role="note" className={NOTE}>
                    This link is too long to draw as a QR code. Copy it instead.
                </p>
            )}
            <span
                data-qr-link=""
                className="select-all text-center font-mono text-[12.5px] [overflow-wrap:anywhere]"
            >
                {linkWords(text)}
            </span>
            {children}
            <div className="flex flex-wrap gap-2">
                <Button
                    type="button"
                    size="sm"
                    disabled={!drawable || busy !== null}
                    onClick={() => void download("png")}
                >
                    Download PNG
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!drawable || busy !== null}
                    onClick={() => void download("svg")}
                >
                    Download SVG
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void copy()}
                >
                    <span aria-live="polite">
                        {copied ? "Copied" : "Copy link"}
                    </span>
                </Button>
            </div>
            {footer}
        </div>
    );
}
