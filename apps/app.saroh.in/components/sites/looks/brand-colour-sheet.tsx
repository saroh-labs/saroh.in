"use client";

import type { SitePalette } from "@saroh/block-contract";
import { brandPalette, contrastRatio } from "@saroh/block-contract";
import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/empty-state";
import { FormSheet } from "@saroh/ui/form-sheet";
import { IconButton } from "@saroh/ui/icon-button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { Notice } from "@saroh/ui/notice";
import { Check, ImageIcon, Pipette, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { colourName } from "@/lib/share-item/share";
import { readLogoColours } from "@/lib/sites/logo-colours";
import type { SiteStyle } from "@/lib/sites/style";

const WHITE = "#FFFFFF";
/** Text's ratio (WCAG AA), as `PALETTE_MIN_CONTRAST`. */
const READS = 4.5;

/** `#e8a0b4`, `e8a0b4` or `#E8A0B4` as `#E8A0B4`; null for anything else. */
export function typedHex(value: string): string | null {
    const v = value.trim().replace(/^#/, "");
    return /^[0-9a-fA-F]{6}$/.test(v) ? `#${v.toUpperCase()}` : null;
}

/** What each part of the page is made from the colour, in words (`WXBBrandColour`). */
export function brandColourLines(hex: string, palette: SitePalette) {
    const name = colourName(hex).toLowerCase();
    const words = palette.accentFg === WHITE ? "white words" : "dark words";
    const tooLight =
        contrastRatio(WHITE, hex) < READS ||
        contrastRatio(hex, palette.bg) < READS;
    return {
        name,
        rows: [
            {
                part: "Background",
                colour: palette.bg,
                made: `A pale tint of your ${name}`,
                reads: null,
            },
            {
                part: "Text",
                colour: palette.fg,
                made: `A deep shade of your ${name}`,
                reads: "Text reads clearly on this",
            },
            {
                part: "Buttons",
                colour: palette.accent,
                made:
                    palette.accent === hex
                        ? `Your ${name}, as it is, with ${words}`
                        : `Your ${name}, a shade deeper, with ${words}`,
                reads: "Button words read clearly on it",
            },
            {
                part: "Links and small text",
                colour: palette.accentText ?? palette.accent,
                made:
                    palette.accentText === hex
                        ? `Your ${name}, as it is`
                        : `Your ${name}, a shade deeper`,
                reads: "Reads clearly, even small",
            },
        ],
        warning: tooLight
            ? `Your ${name} is too light for white words or small text. Buttons get ${words} on it, and links use a deeper shade.`
            : null,
    };
}

/** The colour being made into a palette, and its trial on the page (B4). */
function useBrandColour(
    style: SiteStyle,
    open: boolean,
    onTry?: (next: SiteStyle | null) => void,
) {
    const [typed, setTyped] = useState(style.brandColour ?? "");
    const hex = typedHex(typed);
    const palette = hex ? brandPalette(hex) : null;
    const lines = hex && palette ? brandColourLines(hex, palette) : null;
    const withColour = (h: string): SiteStyle => {
        const { type: _t, ...rest } = style;
        return {
            ...rest,
            brandColour: h,
            palette: brandPalette(h) ?? undefined,
        };
    };

    // The colour on trial, on the page behind the sheet, while it is open.
    const tryRef = useRef(onTry);
    const styleRef = useRef(withColour);
    useEffect(() => {
        tryRef.current = onTry;
        styleRef.current = withColour;
    });
    const trying = open && hex !== null && hex !== style.brandColour;
    useEffect(() => {
        if (!trying || !hex) return;
        tryRef.current?.(styleRef.current(hex));
        return () => tryRef.current?.(null);
    }, [trying, hex]);

    return { typed, setTyped, hex, palette, lines, withColour };
}

type BrandColourState = ReturnType<typeof useBrandColour>;

/** The browser's eyedropper, where it has one (Chrome and Edge). */
interface EyeDropperLike {
    open: () => Promise<{ sRGBHex: string }>;
}
export function eyeDropper(): EyeDropperLike | null {
    if (typeof window === "undefined" || !("EyeDropper" in window)) {
        return null;
    }
    const Ctor = (window as unknown as { EyeDropper: new () => EyeDropperLike })
        .EyeDropper;
    return new Ctor();
}

/**
 * The colour, what each part of the page is made from it with a green
 * tick where it reads, the note when it is light, and the page in it
 * (`WXBBrandColour`).
 */
function BrandColourFields({
    state,
    logoUrl,
}: {
    state: BrandColourState;
    logoUrl?: string | null;
}) {
    const id = useId();
    const { typed, setTyped, hex, palette, lines } = state;
    return (
        <>
            <div className="grid gap-1.5">
                <Label htmlFor={`${id}-hex`}>Your brand colour</Label>
                <div className="flex min-w-0 items-center gap-2">
                    <Input
                        type="color"
                        aria-label="Pick your brand colour"
                        value={(hex ?? "#000000").toLowerCase()}
                        onChange={(e) => setTyped(e.target.value)}
                        className="size-9 shrink-0 cursor-pointer rounded-md p-0.5"
                    />
                    <Input
                        id={`${id}-hex`}
                        value={typed}
                        onChange={(e) => setTyped(e.target.value)}
                        placeholder="#2B6CB0"
                        autoComplete="off"
                        spellCheck={false}
                        aria-invalid={typed !== "" && !hex}
                        aria-describedby={`${id}-hint`}
                        className="h-9 min-w-0 font-mono uppercase"
                        data-brand-colour-input=""
                    />
                    {eyeDropper() ? (
                        <IconButton
                            label="Pick a colour from the screen"
                            icon={<Pipette />}
                            variant="outline"
                            className="size-9 shrink-0"
                            onClick={async () => {
                                try {
                                    const got = await eyeDropper()?.open();
                                    if (got) setTyped(got.sRGBHex);
                                } catch {
                                    // Esc: nothing picked.
                                }
                            }}
                        />
                    ) : null}
                </div>
                <p id={`${id}-hint`} className="text-xs text-muted-foreground">
                    {typed !== "" && !hex
                        ? "Write it as six letters and numbers, like #2B6CB0."
                        : "The colour your sign, your cards or your logo are in."}
                </p>
                <FromYourLogo logoUrl={logoUrl} onPick={setTyped} />
            </div>

            {lines ? (
                <ul
                    className="divide-y rounded-[10px] border"
                    data-brand-colour-lines=""
                >
                    {lines.rows.map((r) => (
                        <li
                            key={r.part}
                            className="flex items-start gap-3 px-3 py-2.5"
                        >
                            <span
                                aria-hidden
                                className="mt-0.5 size-6 shrink-0 rounded-md border"
                                style={{ background: r.colour }}
                            />
                            <span className="min-w-0 text-sm leading-snug">
                                <b className="block font-semibold">{r.part}</b>
                                {r.made}
                                {r.reads ? (
                                    // A green tick line (B3).
                                    <span className="mt-0.5 flex items-center gap-1 text-xs text-success-subtle-foreground">
                                        <Check
                                            aria-hidden
                                            className="size-3.5 shrink-0"
                                        />
                                        {r.reads}
                                    </span>
                                ) : null}
                            </span>
                        </li>
                    ))}
                </ul>
            ) : null}
            {lines?.warning ? (
                <Notice tone="info" data-brand-colour-warning="">
                    {lines.warning}
                </Notice>
            ) : null}
            {palette ? (
                // A hero in these colours: heading, words, button, link (B3).
                <div
                    aria-hidden
                    className="space-y-2 overflow-hidden rounded-[10px] border p-4"
                    style={{ background: palette.bg, color: palette.fg }}
                >
                    <p className="text-xl font-semibold leading-tight">
                        Your page, in these colours
                    </p>
                    <p className="text-sm opacity-80">
                        Words on your page read like this.
                    </p>
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                        <span
                            className="rounded-md px-3 py-1.5 font-medium"
                            style={{
                                background: palette.accent,
                                color: palette.accentFg,
                            }}
                        >
                            Book now
                        </span>
                        <span
                            className="underline underline-offset-2"
                            style={{ color: palette.accentText }}
                        >
                            See prices
                        </span>
                    </div>
                </div>
            ) : null}
        </>
    );
}

/**
 * "Colours from my brand colour" (U24b, `WXBBrandColour`): one colour in,
 * a whole palette out, each part said with whether it reads. Use these
 * colours stores the colour as `brandColour` with the palette made from
 * it; the API makes the palette again from the colour and keeps its own.
 *
 * "From your logo" (B3, DEC-249) reads the logo's main colours in this
 * browser; a logo whose host refuses to be read is picked from the device
 * instead, and never uploaded. Each colour typed or picked is tried on
 * the page behind the undimmed sheet (B4) until Use or Cancel. On a phone
 * or a narrow window it is this sheet; on a wide desk, the popover below.
 */
export function BrandColourSheet({
    open,
    style,
    onClose,
    onUse,
    onTry,
    logoUrl,
}: {
    open: boolean;
    style: SiteStyle;
    onClose: () => void;
    onUse: (next: SiteStyle) => void;
    /** Draw a style on the page unsaved; null puts the page back. */
    onTry?: (next: SiteStyle | null) => void;
    /** The logo the site shows, read for "From your logo". */
    logoUrl?: string | null;
}) {
    const state = useBrandColour(style, open, onTry);
    const { hex, palette, withColour } = state;

    return (
        <FormSheet
            open={open}
            title="Colours from my brand colour"
            description="One colour in, and the page’s colours are made from it, each one clear to read."
            onClose={onClose}
            saveLabel="Use these colours"
            footNote="Every page changes. Goes live when you publish."
            undimmed={onTry !== undefined}
            onSubmit={(e) => {
                e.preventDefault();
                if (!hex || !palette) return;
                onUse(withColour(hex));
                onClose();
            }}
        >
            <BrandColourFields state={state} logoUrl={logoUrl} />
        </FormSheet>
    );
}

/**
 * The same, as a 360px popover beside the Brand panel on a wide desk
 * (B3, `WXBBrandColour`): the page stays in full view, trying each colour.
 */
export function BrandColourPopoverBody({
    style,
    onClose,
    onUse,
    onTry,
    logoUrl,
}: {
    style: SiteStyle;
    onClose: () => void;
    onUse: (next: SiteStyle) => void;
    onTry?: (next: SiteStyle | null) => void;
    logoUrl?: string | null;
}) {
    const state = useBrandColour(style, true, onTry);
    const { hex, palette, withColour } = state;
    return (
        <form
            data-brand-colour-popover=""
            className="flex max-h-[inherit] min-h-0 flex-col"
            onSubmit={(e) => {
                e.preventDefault();
                if (!hex || !palette) return;
                onUse(withColour(hex));
                onClose();
            }}
        >
            <div className="flex items-start gap-2 border-b px-4 py-3">
                <div className="min-w-0 flex-1">
                    <h2 className="text-[0.9375rem] font-semibold">
                        Colours from my brand colour
                    </h2>
                    <p className="text-xs text-muted-foreground">
                        One colour in, and the page’s colours are made from it,
                        each one clear to read.
                    </p>
                </div>
                <IconButton
                    label="Close"
                    icon={<X />}
                    variant="ghost"
                    className="shrink-0"
                    onClick={onClose}
                />
            </div>
            <div className="grid min-h-0 gap-4 overflow-y-auto overflow-x-hidden p-4">
                <BrandColourFields state={state} logoUrl={logoUrl} />
            </div>
            <div className="flex items-center gap-2 border-t bg-background px-4 py-2.5">
                <p className="min-w-0 flex-1 text-xs text-muted-foreground">
                    Live when you publish.
                </p>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onClose}
                >
                    Cancel
                </Button>
                <Button type="submit" size="sm" disabled={!hex || !palette}>
                    Use these colours
                </Button>
            </div>
        </form>
    );
}

type LogoRead =
    | { state: "idle" }
    | { state: "reading" }
    | { state: "read"; colours: string[] }
    | { state: "failed" };

/**
 * "From your logo" (B3): the logo's two or three main colours as
 * swatches, each one put in the brand colour field when pressed. The
 * site's logo is read first; when it can't be (none, or its host refuses),
 * the merchant picks the file, which is read here and never uploaded.
 */
export function FromYourLogo({
    logoUrl,
    onPick,
}: {
    logoUrl?: string | null;
    onPick: (hex: string) => void;
}) {
    const [read, setRead] = useState<LogoRead>({ state: "idle" });
    const fileRef = useRef<HTMLInputElement>(null);

    async function from(src: string, pick = true): Promise<boolean> {
        setRead({ state: "reading" });
        try {
            const colours = await readLogoColours(src);
            setRead({ state: "read", colours });
            if (pick && colours[0]) onPick(colours[0]);
            return true;
        } catch {
            setRead({ state: "failed" });
            return false;
        }
    }

    // The logo's colours as swatches as soon as it opens (B3), none picked:
    // a logo that can't be read waits for the button, as before.
    const logoRef = useRef(logoUrl);
    useEffect(() => {
        const src = logoRef.current;
        if (!src) return;
        let live = true;
        void readLogoColours(src).then(
            (colours) => {
                if (live) setRead({ state: "read", colours });
            },
            () => undefined,
        );
        return () => {
            live = false;
        };
    }, []);

    return (
        <div className="grid gap-1.5" data-from-logo="">
            <div className="flex flex-wrap items-center gap-2">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={read.state === "reading"}
                    onClick={async () => {
                        if (logoUrl && (await from(logoUrl))) return;
                        // No logo, or its host won't let it be read.
                        setRead({ state: "idle" });
                        fileRef.current?.click();
                    }}
                >
                    <ImageIcon aria-hidden />
                    {read.state === "reading" ? "Reading…" : "From your logo"}
                </Button>
                {read.state === "read"
                    ? read.colours.map((c) => (
                          <Button
                              key={c}
                              type="button"
                              variant="outline"
                              size="icon-sm"
                              aria-label={`Use ${colourName(c).toLowerCase()}, ${c}, from your logo`}
                              data-logo-colour={c}
                              onClick={() => onPick(c)}
                              className="border-border-strong coarse:size-11"
                              style={{ background: c }}
                          />
                      ))
                    : null}
                <Input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden
                    onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (!file) return;
                        const url = URL.createObjectURL(file);
                        await from(url);
                        URL.revokeObjectURL(url);
                    }}
                />
            </div>
            {read.state === "read" && read.colours.length === 0 ? (
                <EmptyState
                    size="inline"
                    title="No colour found in your logo"
                    description="Type your colour instead."
                />
            ) : read.state === "failed" ? (
                <p className="text-xs text-muted-foreground">
                    Couldn&apos;t read that picture. Try another file, or type
                    your colour.
                </p>
            ) : read.state === "read" ? (
                <p className="text-xs text-muted-foreground">
                    From your logo. Press a colour to use it.
                </p>
            ) : null}
        </div>
    );
}
