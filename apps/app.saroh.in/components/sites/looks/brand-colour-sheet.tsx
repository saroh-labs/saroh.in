"use client";

import type { SitePalette } from "@saroh/block-contract";
import { brandPalette, contrastRatio } from "@saroh/block-contract";
import { FormSheet } from "@saroh/ui/form-sheet";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { useId, useState } from "react";

import { colourName } from "@/lib/share-item/share";
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

/**
 * "Colours from my brand colour" (U24b, `WXBBrandColour`): one colour in,
 * a whole palette out, each part said with whether it reads. Use these
 * colours stores the colour as `brandColour` with the palette made from
 * it; the API makes the palette again from the colour and keeps its own.
 * "From your logo" is left out: no logo's colour can be read today.
 */
export function BrandColourSheet({
    open,
    style,
    onClose,
    onUse,
}: {
    open: boolean;
    style: SiteStyle;
    onClose: () => void;
    onUse: (next: SiteStyle) => void;
}) {
    const id = useId();
    const [typed, setTyped] = useState(style.brandColour ?? "");
    const hex = typedHex(typed);
    const palette = hex ? brandPalette(hex) : null;
    const lines = hex && palette ? brandColourLines(hex, palette) : null;

    return (
        <FormSheet
            open={open}
            title="Colours from my brand colour"
            description="One colour in, and the page’s colours are made from it, each one clear to read."
            onClose={onClose}
            saveLabel="Use these colours"
            footNote="Every page changes. Saved · goes live when you publish."
            onSubmit={(e) => {
                e.preventDefault();
                if (!hex || !palette) return;
                const { type: _t, ...rest } = style;
                onUse({ ...rest, brandColour: hex, palette });
                onClose();
            }}
        >
            <div className="grid gap-1.5">
                <Label htmlFor={`${id}-hex`}>Your brand colour</Label>
                <div className="flex items-center gap-2">
                    <Input
                        type="color"
                        aria-label="Pick your brand colour"
                        value={(hex ?? "#E0609A").toLowerCase()}
                        onChange={(e) => setTyped(e.target.value)}
                        className="size-10 shrink-0 cursor-pointer rounded-md p-0.5"
                    />
                    <Input
                        id={`${id}-hex`}
                        value={typed}
                        onChange={(e) => setTyped(e.target.value)}
                        placeholder="#E0609A"
                        autoComplete="off"
                        spellCheck={false}
                        aria-invalid={typed !== "" && !hex}
                        aria-describedby={`${id}-hint`}
                        className="font-mono uppercase"
                        data-brand-colour-input=""
                    />
                </div>
                <p id={`${id}-hint`} className="text-xs text-muted-foreground">
                    {typed !== "" && !hex
                        ? "Write it as six letters and numbers, like #E0609A."
                        : "The colour your sign, your cards or your logo are in."}
                </p>
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
                                    <span className="block text-xs text-muted-foreground">
                                        {r.reads}
                                    </span>
                                ) : null}
                            </span>
                        </li>
                    ))}
                </ul>
            ) : null}
            {lines?.warning ? (
                <p
                    className="text-xs leading-relaxed"
                    data-brand-colour-warning=""
                >
                    {lines.warning}
                </p>
            ) : null}
            {palette ? (
                <div
                    aria-hidden
                    className="space-y-2 rounded-[10px] border p-4"
                    style={{ background: palette.bg, color: palette.fg }}
                >
                    <p className="text-lg font-semibold">
                        Your page, in these colours
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
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
        </FormSheet>
    );
}
