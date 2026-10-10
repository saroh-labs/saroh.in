"use client";

import { Button } from "@saroh/ui/button";
import { showError } from "@saroh/ui/toast";
import { useState } from "react";

import { targetAddress } from "@/lib/qr/targets";
import type { QrCodeView } from "@/lib/qr/types";
import { opensWords } from "@/lib/qr/words";

import { QrCodeCard } from "./qr-code-card";
import type { DownloadEnv, QrFormat, QrLogoChoice } from "./qr-download";
import { BROWSER, downloadQr, qrFile } from "./qr-download";

/**
 * One saved code, for someone who may look and not change (`site:read`
 * without `site:update`): the code as it prints, its link, and the files.
 * Nothing here writes: the code exists, so its files are drawn from its
 * own short link, and there is no maker to save from.
 */
export function QrViewer({
    code,
    origin,
    business,
    env = BROWSER,
}: {
    code: QrCodeView;
    origin: string | null;
    business: { name: string } & QrLogoChoice;
    env?: DownloadEnv;
}) {
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);

    async function download(format: QrFormat) {
        const file = qrFile(code, business.name, business);
        if (!file || busy) return;
        setBusy(true);
        try {
            await downloadQr(file, format, env);
        } catch {
            showError("Couldn't make the file. Try again.");
        } finally {
            setBusy(false);
        }
    }

    async function copy() {
        if (!code.link) return;
        try {
            await navigator.clipboard.writeText(code.link);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
        } catch {
            showError(
                "Couldn't copy the link. Select it and copy it instead.",
                code.link,
            );
        }
    }

    return (
        <div
            data-qr-viewer={code.code}
            className="flex w-full max-w-[420px] flex-col gap-3"
        >
            <QrCodeCard
                text={code.link ?? ""}
                style={code.style}
                color={code.color}
                logo={business}
                label={code.label ?? ""}
                link={code.link}
                sampleHost={targetAddress(origin, "/")}
                opens={opensWords(code)}
            />
            <div className="flex flex-wrap gap-2">
                <Button
                    type="button"
                    className="h-10 rounded-[10px] px-4 text-sm"
                    disabled={busy || !code.link}
                    onClick={() => void download("png")}
                >
                    Download PNG
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    className="h-10 rounded-[10px] px-4 text-sm"
                    disabled={busy || !code.link}
                    aria-label="Download SVG"
                    onClick={() => void download("svg")}
                >
                    SVG
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    className="h-10 rounded-[10px] px-4 text-sm"
                    disabled={!code.link}
                    onClick={() => void copy()}
                >
                    <span aria-live="polite">
                        {copied ? "Copied" : "Copy link"}
                    </span>
                </Button>
            </div>
        </div>
    );
}
