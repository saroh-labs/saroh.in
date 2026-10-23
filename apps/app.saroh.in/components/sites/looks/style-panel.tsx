"use client";

import type { LookId, SitePalette } from "@saroh/block-contract";
import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@saroh/ui/popover";
import { useEffect, useId, useRef, useState } from "react";

import { ChoiceGroup } from "@/components/shared/fields/choice-group";
import type { SiteStyle, SiteStyleOptions } from "@/lib/sites/style";
import { activeColourway, contrastOk, inColourway } from "@/lib/sites/style";
import type { PaidKind, StyleChoiceRules } from "@/lib/sites/style-access";
import { ALL_FREE } from "@/lib/sites/style-access";
import { Label } from "@saroh/ui/label";
import { PickerHost } from "./brand-picker";
import { Chip, ColourRow, SwatchGrid, unreadableWords } from "./colour-picker";
import type { LookChoices } from "./look-picker";
import { LookPicker, lookName } from "./look-picker";
import { PaidRefusal } from "./paid-refusal";
import { TypefacePicker } from "./typeface-picker";

/** The rows' names in the Brand tab's words (22 Oct 2026), by row key. */
const ROW_NAMES: Record<string, string> = {
    pageGround: "Page background",
    text: "Text",
    accent: "Accent",
    heroBackground: "Hero",
    ctaBand: "Highlight band",
    footer: "Footer",
};

/** The template colour a palette puts where each row's would be. */
const PALETTE_OF: Record<string, keyof SitePalette> = {
    pageGround: "bg",
    text: "fg",
    accent: "accent",
    heroBackground: "heroBg",
    ctaBand: "ctaBg",
    footer: "footerBg",
};

/** How long "Saved." closes the loop before the line is its hint again. */
const SAVED_MS = 2000;

export const RESET_TITLE = "Reset colours, typeface and spacing?";
export const RESET_BODY =
    "They go back to Classic’s own. Your look, pages and words stay. You can undo it.";

/**
 * The Brand tab (#189; redesigned 22 Oct 2026, DEC-184) — look, type,
 * colour and spacing for a whole site. The rail shows what is chosen, one
 * line each; every set of options opens on demand from its row
 * (`BrandPicker`), so the look, the typeface and all six colours sit
 * above the fold and the sliders follow.
 *
 * Curated, not free: six rows of five options each, drawn from the palette the
 * API serves. A colour picker would let a merchant produce something
 * unreadable, and "pick any hex" moves the design problem onto the person least
 * equipped to solve it. Five good choices is the feature.
 *
 * The typeface is a choice of pairs too (KTD-2): a heading face and a body
 * face picked together, each option set in its own heading face so the
 * merchant compares the type itself rather than its name.
 *
 * A site made from a template is offered that template's colourways first
 * (DEC-090): named whole looks, some in exact colours of the template's own
 * that no row holds. They are choices like the swatches, never a colour
 * picker; choosing a swatch afterwards leaves the colourway for the
 * merchant's own colours.
 *
 * Reset asks first, since it moves every colour, the type and the
 * sliders at once, and then offers Undo (`useUndo`).
 *
 * Every change applies to the preview immediately — the values resolve into
 * `--site-*` custom properties on the preview subtree, so nothing round-trips
 * to show a colour.
 *
 * The Look row leads the panel (DEC-172, U16) when `looks` is given and
 * there is a look to offer; every control below it stays, under a look
 * too, and comes back into force with Classic.
 *
 * Looks, typefaces and colourways are free or paid (DEC-177, `rules`): a
 * paid one says "Paid plans", and on a plan without "Themes, fonts and
 * templates" choosing it is refused here, before anything saves. The
 * previous choice stays chosen and drawn, and one line where it was
 * pressed says why, with the way to plans. Colours and spacing are never
 * paid.
 */
export function StylePanel({
    style,
    options,
    onChange,
    onReset,
    saving,
    dirty = false,
    looks,
    rules = ALL_FREE,
    onTry,
    heroInText = false,
    inline = false,
}: {
    style: SiteStyle;
    options: SiteStyleOptions;
    onChange: (next: SiteStyle) => void;
    onReset: () => void;
    saving: boolean;
    /** A change not saved yet (or refused): no "Saved." for it. */
    dirty?: boolean;
    /** The Look row's facts and its choice; absent draws no row. */
    looks?: LookChoices;
    /** Which choices are paid, and refused on this plan (DEC-177). */
    rules?: StyleChoiceRules;
    /** Draw a style on the page unsaved (a typeface tried); null ends it. */
    onTry?: (next: SiteStyle | null) => void;
    /** The page's hero draws in the text colour: the Hero row moves nothing. */
    heroInText?: boolean;
    /** In the phone's sheet: pickers open inside it, not as popovers. */
    inline?: boolean;
}) {
    // The paid choice just refused, and where: one line, by that control.
    const [refused, setRefused] = useState<{
        kind: PaidKind;
        name: string;
    } | null>(null);
    /** Take a choice, or refuse it in place: false when refused. */
    function allowed(kind: PaidKind, id: string, name: string): boolean {
        if (rules.refuses(kind, id)) {
            setRefused({ kind, name });
            return false;
        }
        setRefused(null);
        return true;
    }
    const paidMark = (kind: PaidKind, id: string) =>
        rules.isPaid(kind, id) ? (
            <Badge variant="tag" size="sm" className="ml-auto shrink-0">
                Paid plans
            </Badge>
        ) : null;
    const refusedOf = (kind: PaidKind) =>
        refused?.kind === kind ? refused.name : null;
    const colourwayRefused = refusedOf("colourway");

    const swatchesFor = (row: string) =>
        options.rows.find((r) => r.key === row)?.swatches ?? [];
    const swatchOf = (row: string, key: string) =>
        swatchesFor(row).find((s) => s.key === key);
    const hslOf = (row: string, key: string) => swatchOf(row, key)?.hsl;

    const ground = swatchOf("pageGround", style.colours.pageGround);
    const groundHsl = ground?.hsl;

    /** Whether a text colour is legible on the currently chosen page ground. */
    const textReadable = (textHsl: string) =>
        !groundHsl || contrastOk(groundHsl, textHsl);

    /*
     * Which text swatch is actually in force.
     *
     * A style saved before this rule existed — or by an older client — can hold
     * a pair the renderer now corrects. Marking the STORED choice as selected
     * would show a disabled swatch as chosen while the preview rendered a
     * different colour, so the panel follows the preview: it shows what is
     * really being used.
     */
    const storedTextHsl = hslOf("text", style.colours.text);
    const effectiveTextKey =
        storedTextHsl && !textReadable(storedTextHsl)
            ? (swatchesFor("text").find((sw) => textReadable(sw.hsl))?.key ??
              style.colours.text)
            : style.colours.text;

    const colourways = options.colourways ?? [];
    const current = activeColourway(style, colourways);
    // A colourway's own palette replaces the rows' colours while it is on.
    const paletteOn = style.palette !== undefined;

    function setColour(row: string, key: string) {
        // A swatch leaves the template's palette for the merchant's colours.
        const { palette: _palette, ...rest } = style;
        const next: SiteStyle = {
            ...rest,
            colours: { ...style.colours, [row]: key },
        };

        /*
         * Page ground and text are independent, so a new ground can make the
         * current text unreadable. Move the text to a legible option HERE, so
         * the merchant sees the swatch move, rather than letting the renderer
         * quietly substitute one — a site that silently ignores a choice is
         * worse than one that visibly corrects it.
         */
        if (row === "pageGround") {
            const ground = hslOf("pageGround", key);
            const current = hslOf("text", style.colours.text);
            if (ground && current && !contrastOk(ground, current)) {
                const legible = swatchesFor("text").find((sw) =>
                    contrastOk(ground, sw.hsl),
                );
                if (legible) next.colours.text = legible.key;
            }
        }

        onChange(next);
    }
    function setScalar(key: string, value: number) {
        onChange({ ...style, scalars: { ...style.scalars, [key]: value } });
    }
    const fontPairs = options.fontPairs ?? [];
    const activePair = style.fontPair ?? fontPairs[0]?.key;
    /** The style with a pair: the default is stored as no pair at all. */
    function withPair(key: string): SiteStyle {
        // As the API keeps it, so choosing it back leaves nothing to publish.
        const { fontPair: _previous, ...rest } = style;
        return key === fontPairs[0]?.key ? rest : { ...rest, fontPair: key };
    }
    function setFontPair(key: string): boolean {
        const name = fontPairs.find((p) => p.key === key)?.name ?? key;
        if (!allowed("fontPair", key, name)) return false;
        onChange(withPair(key));
        return true;
    }

    // "Saved." for two seconds once a save lands, then the hint again.
    const [savedNow, setSavedNow] = useState(false);
    const wasSaving = useRef(saving);
    useEffect(() => {
        const landed = wasSaving.current && !saving && !dirty;
        wasSaving.current = saving;
        if (!landed) return;
        setSavedNow(true);
        const id = setTimeout(() => setSavedNow(false), SAVED_MS);
        return () => clearTimeout(id);
    }, [saving, dirty]);

    const [host, setHost] = useState<HTMLDivElement | null>(null);

    return (
        /*
         * The rail's Brand tab (G2) names this panel and is the way back to
         * the page's blocks, so it carries no header or Back of its own.
         */
        <PickerHost.Provider value={inline ? host : null}>
            <div className="relative flex min-h-0 flex-1 flex-col">
                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-3 [&>section+section]:border-t [&>section+section]:pt-4">
                    {looks ? (
                        <LookPicker
                            style={style}
                            options={options}
                            {...looks}
                            rules={rules}
                            refused={refusedOf("look")}
                            onChoose={(look: LookId | null) => {
                                if (
                                    look &&
                                    !allowed("look", look, lookName(look))
                                ) {
                                    return;
                                }
                                if (!look) setRefused(null);
                                looks.onChoose(look);
                            }}
                        />
                    ) : null}
                    {/* The pairing picker H1's note promised (DEC-046); an
                        older API that serves no pairs shows no choice. */}
                    {fontPairs.length > 0 ? (
                        <TypefacePicker
                            pairs={fontPairs}
                            active={activePair}
                            rules={rules}
                            refused={refusedOf("fontPair")}
                            onChoose={setFontPair}
                            onTry={
                                onTry
                                    ? (key) =>
                                          onTry(
                                              key === null
                                                  ? null
                                                  : withPair(key),
                                          )
                                    : undefined
                            }
                        />
                    ) : null}
                    <section className="space-y-1">
                        <h3 className="label pb-1">Colour</h3>
                        {colourways.length > 0 ? (
                            <ColourRow
                                label="Colourway"
                                chip={
                                    <span
                                        aria-hidden
                                        className="flex shrink-0 overflow-hidden rounded-[5px] border border-foreground/20"
                                    >
                                        {(current?.chips ?? []).map(
                                            (hsl, i) => (
                                                <span
                                                    key={i}
                                                    className="h-[18px] w-2"
                                                    style={{
                                                        background: `hsl(${hsl})`,
                                                    }}
                                                />
                                            ),
                                        )}
                                    </span>
                                }
                                value={current?.name ?? "Your own"}
                                foot={
                                    colourwayRefused ? (
                                        <PaidRefusal name={colourwayRefused} />
                                    ) : undefined
                                }
                                after={
                                    colourwayRefused ? (
                                        <PaidRefusal name={colourwayRefused} />
                                    ) : undefined
                                }
                            >
                                <ChoiceGroup
                                    label="Colourway"
                                    className="space-y-1 p-3"
                                    value={current?.id ?? null}
                                    onChange={(id) => {
                                        const cw = colourways.find(
                                            (c) => c.id === id,
                                        );
                                        if (!cw) return;
                                        if (
                                            !allowed(
                                                "colourway",
                                                cw.id,
                                                cw.name,
                                            )
                                        ) {
                                            return;
                                        }
                                        onChange(inColourway(style, cw));
                                    }}
                                    choices={colourways.map((cw) => ({
                                        value: cw.id,
                                        label: (
                                            <>
                                                <span
                                                    aria-hidden="true"
                                                    className="flex shrink-0 overflow-hidden rounded-sm border"
                                                >
                                                    {cw.chips.map((hsl, i) => (
                                                        <span
                                                            key={i}
                                                            className="h-5 w-3.5"
                                                            style={{
                                                                background: `hsl(${hsl})`,
                                                            }}
                                                        />
                                                    ))}
                                                </span>
                                                {cw.name}
                                                {paidMark("colourway", cw.id)}
                                            </>
                                        ),
                                    }))}
                                    itemClassName={(active) =>
                                        cn(
                                            "flex min-h-9 w-full items-center gap-2.5 rounded border px-2.5 py-1.5 text-left text-sm focus-visible:ring-offset-1 coarse:min-h-11",
                                            active
                                                ? "border-foreground ring-1 ring-foreground"
                                                : "border-border hover:bg-muted",
                                        )
                                    }
                                />
                            </ColourRow>
                        ) : null}
                        {paletteOn ? (
                            <p className="py-1 text-xs text-muted-foreground">
                                {current
                                    ? `The ${current.name} colourway uses your template's own colours.`
                                    : "These colours are your template's own."}{" "}
                                Choose a colour below to use your own instead.
                            </p>
                        ) : null}
                        {options.rows.map((row) => {
                            const label = ROW_NAMES[row.key] ?? row.label;
                            const value =
                                row.key === "text"
                                    ? effectiveTextKey
                                    : style.colours[row.key];
                            const swatch = swatchOf(row.key, value);
                            const template = paletteOn
                                ? style.palette?.[PALETTE_OF[row.key]]
                                : undefined;
                            // Only the text row can be illegible against a
                            // choice made elsewhere in this panel.
                            const unreadable = (sw: { hsl: string }) =>
                                row.key === "text" && !textReadable(sw.hsl);
                            const locked =
                                ground && row.key === "text"
                                    ? row.swatches.filter(unreadable)
                                    : [];
                            return (
                                <div key={row.key} className="space-y-1">
                                    <ColourRow
                                        label={label}
                                        note={
                                            row.key === "text" && ground
                                                ? `on ${ground.label}`
                                                : undefined
                                        }
                                        chip={
                                            <Chip
                                                fill={
                                                    template ??
                                                    (swatch
                                                        ? `hsl(${swatch.hsl})`
                                                        : undefined)
                                                }
                                            />
                                        }
                                        value={
                                            template
                                                ? "Template's own"
                                                : (swatch?.label ?? "")
                                        }
                                        foot={
                                            ground && locked.length > 0
                                                ? locked.map((sw) => (
                                                      <p key={sw.key}>
                                                          {unreadableWords(
                                                              sw,
                                                              ground,
                                                          )}
                                                      </p>
                                                  ))
                                                : undefined
                                        }
                                    >
                                        <SwatchGrid
                                            label={label}
                                            swatches={row.swatches}
                                            value={paletteOn ? null : value}
                                            disabled={unreadable}
                                            onChoose={(key) =>
                                                setColour(row.key, key)
                                            }
                                        />
                                    </ColourRow>
                                    {row.key === "heroBackground" &&
                                    heroInText ? (
                                        <p
                                            data-hero-hint=""
                                            className="px-0.5 text-[0.71875rem] leading-snug text-muted-foreground"
                                        >
                                            This hero uses your text colour.
                                            Change it in the hero block.
                                        </p>
                                    ) : null}
                                </div>
                            );
                        })}
                    </section>

                    <section className="space-y-3">
                        <h3 className="label">Spacing and shape</h3>
                        {options.scalars.map((scalar) => {
                            const value =
                                style.scalars[scalar.key] ?? scalar.min;
                            // A template may set a value under the merchant's
                            // range (a 1px hairline gap, DEC-090): the slider
                            // shows it truly rather than pinned to its floor.
                            const min = Math.min(scalar.min, value);
                            return (
                                <div key={scalar.key} className="space-y-1">
                                    <div className="flex items-baseline justify-between">
                                        <Label
                                            htmlFor={`style-${scalar.key}`}
                                            className="text-xs font-normal leading-normal"
                                        >
                                            {scalar.label}
                                        </Label>
                                        <span className="text-xs tabular-nums text-muted-foreground">
                                            {scalar.unit === "×"
                                                ? `${value.toFixed(2)}×`
                                                : `${value}${scalar.unit}`}
                                        </span>
                                    </div>
                                    <input
                                        id={`style-${scalar.key}`}
                                        type="range"
                                        min={min}
                                        max={scalar.max}
                                        step={scalar.step}
                                        value={value}
                                        onChange={(e) =>
                                            setScalar(
                                                scalar.key,
                                                Number(e.target.value),
                                            )
                                        }
                                        className="w-full accent-foreground coarse:h-11"
                                    />
                                </div>
                            );
                        })}
                    </section>
                </div>

                <div className="flex items-center justify-between gap-2 border-t p-3">
                    <p
                        className="text-xs text-muted-foreground"
                        data-style-save-line=""
                    >
                        {saving
                            ? "Saving…"
                            : savedNow
                              ? "Saved. Applies to every page."
                              : "Applies to every page."}
                    </p>
                    <ResetStyle onReset={onReset} />
                </div>
                {/* The phone's pickers open here, over the rail. */}
                <div ref={setHost} />
            </div>
        </PickerHost.Provider>
    );
}

/**
 * "Reset style…" (22 Oct 2026): it moves every colour, the typeface and
 * the sliders at once, so it asks first, keeping the style the safe way
 * out; once done, Undo puts it all back in one press (`useUndo`).
 */
function ResetStyle({ onReset }: { onReset: () => void }) {
    const [open, setOpen] = useState(false);
    const titleId = useId();
    const bodyId = useId();
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-haspopup="dialog"
                >
                    Reset style…
                </Button>
            </PopoverTrigger>
            <PopoverContent
                role="alertdialog"
                aria-labelledby={titleId}
                aria-describedby={bodyId}
                side="top"
                align="end"
                className="w-[300px] rounded-xl p-3.5"
            >
                <p id={titleId} className="text-sm font-semibold">
                    {RESET_TITLE}
                </p>
                <p
                    id={bodyId}
                    className="mb-3 mt-1.5 text-[0.78125rem] leading-normal text-muted-foreground"
                >
                    {RESET_BODY}
                </p>
                <div className="flex justify-end gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        autoFocus
                        onClick={() => setOpen(false)}
                    >
                        Keep my style
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                            setOpen(false);
                            onReset();
                        }}
                    >
                        Reset style
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
}
