import { QR_GROUND, QR_TILE_FILL } from "@saroh/ui/lib/qr-art";
import { cn } from "@saroh/ui/lib/utils";
import type { QrArtLogo } from "@saroh/ui/qr-art";
import { QrArt } from "@saroh/ui/qr-art";
import { useMemo } from "react";

import type { QrPrintFormatView } from "@/lib/qr/print";
import type { QrCodeView } from "@/lib/qr/types";

import { artOf } from "./qr-download";

/** How wide each paper is drawn, in px: the tray is 150px tall. */
const WIDTH: Record<QrPrintFormatView["format"], number> = {
    standee: 90,
    tent: 90,
    sticker: 112,
    card: 144,
};

/**
 * A print file in small: the paper in the real file's proportions, the
 * business name, the code and its label where the file puts them (beside
 * the code on a card, above and below it otherwise), and the code at the
 * share of the paper it really takes.
 *
 * The code is the saved code's own, drawn from its short link in its own
 * look. Without one the paper is drawn with an empty square where the code
 * goes: there is nothing truthful to put in it yet.
 *
 * Paper is white and its type Ink in both themes, as the code card is: a
 * picture of the thing that prints, not workspace chrome. It is decoration
 * beside the format's name and size, so it is hidden from a screen reader.
 */
export function QrPrintThumb({
    print,
    code,
    business,
    dimmed = false,
}: {
    print: QrPrintFormatView;
    code: Pick<QrCodeView, "link" | "style" | "color" | "label"> | null;
    business: { name: string; initials?: string; dataUrl?: string | null };
    /** The plan leaves the file off: drawn, but as a preview. */
    dimmed?: boolean;
}) {
    const link = code?.link ?? null;
    const style = code?.style ?? "PLAIN";
    const art = useMemo(
        () => (link ? artOf(link, style) : null),
        [link, style],
    );
    const logo: QrArtLogo | undefined =
        style !== "BRANDED"
            ? undefined
            : business.dataUrl
              ? { src: business.dataUrl }
              : { initials: business.initials ?? "" };
    const color = code?.color ?? QR_TILE_FILL;
    const label = (code?.label ?? "").trim();
    const share = `${(print.code / print.trim.width) * 100}%`;

    const square =
        art && art.n > 0 ? (
            <QrArt
                art={art}
                color={color}
                logo={logo}
                aria-label={`${print.name} preview`}
                style={{ width: share }}
                className="shrink-0"
            />
        ) : (
            <span
                data-qr-print-empty=""
                style={{ width: share }}
                className="block aspect-square shrink-0 rounded-[3px] border border-dashed border-neutral-400"
            />
        );
    const words = "max-w-full truncate text-[11px] font-semibold leading-tight";

    return (
        <div
            aria-hidden
            className="flex h-[150px] items-center justify-center rounded-[10px] bg-muted"
        >
            <div
                data-qr-print-paper={print.format}
                style={{
                    width: WIDTH[print.format],
                    aspectRatio: `${print.trim.width} / ${print.trim.height}`,
                    background: QR_GROUND,
                    color: QR_TILE_FILL,
                }}
                className={cn(
                    "flex min-w-0 items-center justify-center overflow-hidden border border-border",
                    print.round ? "rounded-full" : "rounded-[3px]",
                    print.beside ? "gap-1.5 px-1.5" : "flex-col gap-1 px-2",
                    dimmed && "opacity-50",
                )}
            >
                {print.beside ? (
                    <>
                        {square}
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className={cn(words, "font-display")}>
                                {business.name}
                            </span>
                            {label ? (
                                <span className={words} style={{ color }}>
                                    {label}
                                </span>
                            ) : null}
                        </span>
                    </>
                ) : (
                    <>
                        <span
                            className={cn(
                                words,
                                "font-display",
                                print.round && "max-w-[70%]",
                            )}
                        >
                            {business.name}
                        </span>
                        {square}
                        {label ? (
                            <span
                                className={cn(
                                    words,
                                    print.round && "max-w-[70%]",
                                )}
                                style={{ color }}
                            >
                                {label}
                            </span>
                        ) : null}
                    </>
                )}
            </div>
        </div>
    );
}
