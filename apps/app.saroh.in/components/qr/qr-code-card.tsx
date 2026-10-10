import { QR_GROUND } from "@saroh/ui/lib/qr-art";
import type { QrArtLogo } from "@saroh/ui/qr-art";
import { QrArt } from "@saroh/ui/qr-art";
import { useMemo } from "react";

import type { QrStyle } from "@/lib/qr/types";
import { linkWords, TOO_LIGHT } from "@/lib/qr/words";

import type { QrLogoChoice } from "./qr-download";
import { artOf } from "./qr-download";

/** The design's line that keeps this code apart from the UPI QR (R5). */
export const UPI_LINE =
    "Your UPI QR stays separate. This one opens your page, not a payment.";

/**
 * The code as it will print ("Saroh QR Codes" design, the middle column):
 * the code at 280px at most, its label on a pill in the code's colour, the
 * short link in mono, what it opens, and the line that keeps it apart from
 * the UPI QR.
 *
 * The code's ground is white and its colour is the code's own in both
 * themes: it is a picture of the thing that prints, not workspace chrome.
 * Without a `link` it is a sample (the business's address in the chosen
 * look), and says so.
 */
export function QrCodeCard({
    text,
    style,
    color,
    logo,
    label,
    link,
    sampleHost,
    opens,
    tooLight = false,
    children,
}: {
    /** What is encoded: a saved code's link, or the address as a sample. */
    text: string;
    style: QrStyle;
    color: string;
    logo: QrLogoChoice;
    label: string;
    /** The saved code's short link; null while it is a sample. */
    link: string | null;
    /** "glow.saroh.app", for the sample's line. */
    sampleHost: string;
    /** "Booking page"; null when nothing is chosen. */
    opens: string | null;
    tooLight?: boolean;
    children?: React.ReactNode;
}) {
    const art = useMemo(() => artOf(text, style), [text, style]);
    const artLogo: QrArtLogo | undefined =
        style !== "BRANDED"
            ? undefined
            : logo.dataUrl
              ? { src: logo.dataUrl }
              : { initials: logo.initials };
    const shown = label.trim();
    return (
        <div
            data-qr-card={link ? "code" : "sample"}
            className="flex min-w-0 flex-col items-center gap-3.5 rounded-2xl border border-border bg-card px-5 py-7"
        >
            <div className="w-full max-w-[280px]">
                <QrArt
                    art={art}
                    color={color}
                    logo={artLogo}
                    aria-label={
                        link
                            ? `QR code${opens ? ` that opens ${opens}` : ""}`
                            : "A sample of your QR code"
                    }
                />
            </div>
            {shown ? (
                <span
                    data-qr-label=""
                    // The pill is the code's colour with white words, as it
                    // prints: the code's own colours, not the workspace's.
                    style={{ background: color, color: QR_GROUND }}
                    className="max-w-full rounded-full px-[18px] py-2 text-center font-display text-xl font-semibold tracking-[-0.02em] [overflow-wrap:anywhere]"
                >
                    {shown}
                </span>
            ) : null}
            <div className="flex min-w-0 max-w-full flex-col items-center gap-1 text-center">
                {link ? (
                    <span
                        data-qr-link=""
                        className="font-mono text-[12.5px] [overflow-wrap:anywhere]"
                    >
                        {linkWords(link)}
                    </span>
                ) : (
                    <span className="font-mono text-[12.5px] text-muted-foreground [overflow-wrap:anywhere]">
                        {sampleHost}/q/…
                    </span>
                )}
                <span className="text-[12.5px] text-muted-foreground">
                    {link
                        ? opens
                            ? `opens ${opens}`
                            : null
                        : `A sample for now${opens ? `, for ${opens}` : ""}. Its short link is made with the code.`}
                </span>
            </div>
            {tooLight ? (
                <span
                    role="alert"
                    className="rounded-[9px] bg-destructive-subtle px-3 py-2 text-[13px] text-destructive-subtle-foreground"
                >
                    {TOO_LIGHT}
                </span>
            ) : null}
            {children}
            <span className="max-w-[34ch] text-center text-[12.5px] leading-normal text-muted-foreground">
                {UPI_LINE}
            </span>
        </div>
    );
}
