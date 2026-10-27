"use client";

import { EmailGate, ToolGateProvider } from "@saroh/search-pages";

import { qrCodeMaker as copy } from "@/content/qr-code-maker";

import { Button } from "../../shared/buttons/button";
import { toolGateSubmit } from "../tool-gate";

/** Nothing to download yet: the one disabled treatment, with the reason beside it. */
const OFF =
    "cursor-not-allowed bg-disabled text-disabled-foreground hover:bg-disabled hover:text-disabled-foreground active:scale-100";

/**
 * Under the code (design 02): the email gate every free tool shares (the
 * package's `EmailGate`, DEC-195 A16), then the downloads it unlocks. The
 * email is the only thing the page sends to Saroh; the files are made here,
 * in the browser (`qr-download.ts`). No news tickbox: an address typed into
 * a public tool isn't verified, so it can't say yes to marketing.
 *
 * `sp tp qc-side` puts the gate in the package's light card colours; the
 * card it sits in is saroh.in's own.
 */
export function QrMakerGate({
    blocked,
    pngError,
    onPng,
    onSvg,
}: {
    /** Why there is nothing to download yet ("" when the page says so elsewhere), or null. */
    blocked: string | null;
    pngError: string | null;
    onPng: () => void;
    onSvg: () => void;
}) {
    const off = blocked !== null;
    return (
        <div className="sp tp qc-side w-full !bg-transparent">
            <ToolGateProvider privacy="/privacy">
                <EmailGate
                    label={copy.gate.title}
                    button={copy.gate.submit}
                    // The email, and nothing about the code.
                    onSubmit={(email) => toolGateSubmit(email)}
                >
                    <div className="grid justify-items-center gap-2">
                        <div className="flex flex-wrap justify-center gap-2">
                            <Button
                                size="sm"
                                aria-disabled={off || undefined}
                                aria-describedby={
                                    blocked ? "qr-blocked" : undefined
                                }
                                onClick={off ? undefined : onPng}
                                className={off ? OFF : undefined}
                            >
                                {copy.downloads.png}
                            </Button>
                            <Button
                                variant="secondary"
                                size="sm"
                                aria-label={copy.downloads.svgName}
                                aria-disabled={off || undefined}
                                aria-describedby={
                                    blocked ? "qr-blocked" : undefined
                                }
                                onClick={off ? undefined : onSvg}
                                className={
                                    off ? `${OFF} border-none` : undefined
                                }
                            >
                                {copy.downloads.svg}
                            </Button>
                        </div>
                        {blocked ? (
                            <span
                                id="qr-blocked"
                                className="text-center text-[13px] text-muted-foreground"
                            >
                                {blocked}
                            </span>
                        ) : null}
                        {pngError ? (
                            <span
                                role="alert"
                                className="text-center text-[13px] text-mk-bad"
                            >
                                {pngError}
                            </span>
                        ) : null}
                    </div>
                </EmailGate>
            </ToolGateProvider>
        </div>
    );
}
