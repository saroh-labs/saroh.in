"use client";

import { Button } from "@saroh/ui/button";

import { swatchesWith } from "@/lib/qr/colours";
import { targetAddress } from "@/lib/qr/targets";
import { linkWords, placeWords } from "@/lib/qr/words";

import { QrCodeCard } from "./qr-code-card";
import { QrLookControls } from "./qr-look-controls";
import { QrPrintSlot } from "./qr-print-slot";
import { QrTargetPicker } from "./qr-target-picker";
import type { UseQrMakerInput } from "./use-qr-maker";
import { useQrMaker } from "./use-qr-maker";

/** The design's buttons: 40px, 10px corners, 14px 600. */
const BUTTON = "h-10 rounded-[10px] px-4 text-sm";

/**
 * The QR code maker ("Saroh QR Codes" design, "01 In-app Share"): three
 * columns that stack on a phone. What it opens and where it goes; the code
 * as it will print; then style, colour, label and the buttons.
 *
 * What is drawn before a code is made is a sample of the business's
 * address, and says so. "Make this code", or the first Download, makes the
 * code; the card then shows its real short link and every file is drawn
 * from it (`use-qr-maker.ts`). Mounted with a `key` of the code being
 * changed, so Change starts from that code and Cancel from a clean maker.
 */
export function QrMaker({
    swatches,
    ...input
}: UseQrMakerInput & {
    /** Ink first, each dark enough to scan (`qrSwatches`). */
    swatches: readonly string[];
}) {
    const m = useQrMaker(input);
    const { draft, bound } = m;
    const { origin, business } = input;
    const cannotMake = origin === null;
    const off = m.busy !== null || m.tooLight || cannotMake;
    const primary: "make" | "save" | "png" = !bound
        ? "make"
        : m.dirty
          ? "save"
          : "png";

    return (
        <div data-qr-maker={m.isChanging ? "change" : "make"}>
            {m.isChanging && bound ? (
                <p
                    role="status"
                    className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[10px] bg-muted px-3.5 py-2.5 text-[13px] text-foreground"
                >
                    <span className="min-w-0 [overflow-wrap:anywhere]">
                        Changing the code placed at{" "}
                        <strong className="font-semibold">
                            {placeWords(bound)}
                        </strong>
                        {bound.link ? (
                            <>
                                {" "}
                                ·{" "}
                                <span className="font-mono text-[12.5px]">
                                    {linkWords(bound.link)}
                                </span>
                            </>
                        ) : null}
                        . Its link stays the same, so the printed one keeps
                        working.
                    </span>
                </p>
            ) : null}
            <div className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))]">
                <QrTargetPicker
                    targets={input.targets}
                    target={m.target}
                    problem={
                        m.problem?.where === "target" ? m.problem.text : null
                    }
                    place={draft.place}
                    placeNote={draft.placeNote}
                    onTarget={m.pickTarget}
                    onPlace={m.pickPlace}
                    onPlaceNote={m.setPlaceNote}
                />

                <QrCodeCard
                    text={m.text}
                    style={draft.style}
                    color={draft.color}
                    logo={business}
                    label={draft.label}
                    link={bound?.link ?? null}
                    sampleHost={targetAddress(origin, "/")}
                    opens={m.target?.name ?? null}
                    tooLight={m.tooLight}
                >
                    {cannotMake ? (
                        <span
                            role="note"
                            className="max-w-[34ch] text-center text-[13px] text-foreground/80"
                        >
                            Your site has no web address yet, so a code has
                            nowhere to point.
                        </span>
                    ) : null}
                </QrCodeCard>

                <div className="flex min-w-0 flex-col gap-[18px]">
                    <QrLookControls
                        style={draft.style}
                        color={draft.color}
                        label={draft.label}
                        swatches={swatchesWith(swatches, draft.color)}
                        lock={m.lock}
                        brandedLocked={m.brandedLocked}
                        colorLocked={m.colorLocked}
                        keptBranded={
                            m.lock !== null && bound?.style === "BRANDED"
                        }
                        logo={{
                            has: business.hasLogo,
                            read: business.dataUrl !== null,
                        }}
                        colorProblem={
                            m.problem?.where === "color" ? m.problem.text : null
                        }
                        onStyle={m.pickStyle}
                        onColor={m.pickColor}
                        onLabel={m.setLabel}
                    />

                    <div className="mt-auto flex flex-col gap-2.5">
                        {bound && !m.isChanging && !m.dirty ? (
                            <p className="text-[13px] text-foreground/80">
                                You already have this code.{" "}
                                <button
                                    type="button"
                                    onClick={m.makeAnother}
                                    className="cursor-pointer rounded-[4px] font-semibold text-brand underline underline-offset-2 transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:text-muted-foreground"
                                >
                                    Make another
                                </button>
                            </p>
                        ) : null}
                        <div className="flex flex-wrap gap-2">
                            {primary !== "png" ? (
                                <Button
                                    type="button"
                                    className={BUTTON}
                                    disabled={off}
                                    onClick={() => void m.make()}
                                >
                                    {primary === "make"
                                        ? "Make this code"
                                        : "Save changes"}
                                </Button>
                            ) : null}
                            <Button
                                type="button"
                                variant={
                                    primary === "png" ? "default" : "outline"
                                }
                                className={BUTTON}
                                disabled={off}
                                onClick={() => void m.download("png")}
                            >
                                Download PNG
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                className={BUTTON}
                                disabled={off}
                                aria-label="Download SVG"
                                onClick={() => void m.download("svg")}
                            >
                                SVG
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                className={BUTTON}
                                disabled={!bound?.link || m.busy !== null}
                                onClick={() => void m.copy()}
                            >
                                <span aria-live="polite">
                                    {m.copied ? "Copied" : "Copy link"}
                                </span>
                            </Button>
                            {m.isChanging ? (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    className={BUTTON}
                                    disabled={m.busy !== null}
                                    onClick={input.onChangingDone}
                                >
                                    Cancel
                                </Button>
                            ) : null}
                        </div>
                        {!bound && !cannotMake ? (
                            <p className="text-[13px] text-muted-foreground">
                                A download makes the code first, so the file
                                carries its real short link.
                            </p>
                        ) : null}
                    </div>
                </div>
            </div>
            {/* "Ready to print": the saved code as PDFs, between the maker
                and "Your QR codes", as the design has it. */}
            <QrPrintSlot
                siteId={input.siteId}
                code={bound}
                lock={m.lock}
                business={business}
            />
        </div>
    );
}
