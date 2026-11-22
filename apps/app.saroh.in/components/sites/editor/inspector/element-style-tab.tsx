"use client";

import type { ComponentStyles, SectionStyles } from "@saroh/block-contract";
import {
    COMPONENT_OPTION_LABELS,
    COMPONENT_STYLE_OPTIONS,
    contrastRatio,
    customColourWords,
    darkenToRead,
    LOOKS,
    normalizeHex,
    sectionFrameSettingsOf,
} from "@saroh/block-contract";
import { Button } from "@saroh/ui/button";
import { ChoiceGroup } from "@saroh/ui/choice-group";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { cn } from "@saroh/ui/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@saroh/ui/popover";
import { Segmented } from "@saroh/ui/segmented";
import { Check, Plus, TriangleAlert } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useId, useMemo, useState } from "react";

import { count } from "@/lib/format/plural";
import type {
    ButtonLook,
    SelectedElement,
    StyleScope,
} from "@/lib/sites/element-style";
import {
    buttonLevels,
    changedFields,
    compact,
    CTA_OF_FILL,
    elementAt,
    imageLevels,
    inForce,
    lookCorners,
    readableLine,
    roleFill,
    textOf,
    withElementAt,
} from "@/lib/sites/element-style";
import type { Section } from "@/lib/sites/service";
import type { SiteStyle, SiteStyleOptions } from "@/lib/sites/style";
import { resolveStyleVariables, withComponents } from "@/lib/sites/style";

import { useEditorReadOnly } from "../read-only";

/** The Colour row's roles, in the board's order (CSI-C, without Tint). */
const ROLES = [
    { value: "bg", label: "Background" },
    { value: "surface", label: "Panels" },
    { value: "fg", label: "Text" },
    { value: "accent", label: "Brand" },
    { value: "rule", label: "Lines" },
] as const;

/** Where the whole site keeps each field (Brand › Buttons and shapes). */
const SITE_KEY = {
    colour: "buttonColour",
    style: "buttonStyle",
    corners: "buttons",
    size: "buttonSize",
} as const;

export interface ElementStyleTabProps {
    element: SelectedElement;
    section: Section;
    /** "Hero": the section's name, for "Buttons in Hero". */
    sectionName: string;
    scope: StyleScope;
    onScope: (next: StyleScope) => void;
    style: SiteStyle;
    styleOptions: SiteStyleOptions;
    onChange: (next: Section) => void;
    onSiteStyle: (next: SiteStyle) => void;
    /** The phone sheet draws the reset in its own pinned foot. */
    foot?: (
        line: string,
        reset: { word: string; run: () => void } | null,
    ) => ReactNode;
}

/**
 * Inspector › Style for one button or photo (board CSI-C, CS1–CS4):
 * Apply to first, then Colour (the site's roles and Custom), Style,
 * Corners and Size, each marked Changed when it differs from the look,
 * and one reset at the chosen level. Every write goes through the
 * section (this element, this section) or the site's style (whole site).
 */
export function ElementStyleTab({
    element,
    section,
    sectionName,
    scope,
    onScope,
    style,
    styleOptions,
    onChange,
    onSiteStyle,
    foot,
}: ElementStyleTabProps) {
    const readOnly = useEditorReadOnly();
    const lookName = style.look ? LOOKS[style.look].name : "Classic";
    const own = elementAt(section.content, element.path);
    const sectionStyles = sectionFrameSettingsOf(section.content).styles;
    const site: ComponentStyles = style.components ?? {};
    const button = element.kind === "button";
    // A photo's levels name only corners: read as a button's, the rest absent.
    const levels: Record<StyleScope | "look", ButtonLook> = button
        ? buttonLevels(own, sectionStyles, site, style.look)
        : (imageLevels(own, sectionStyles, site, style.look) as Record<
              StyleScope | "look",
              ButtonLook
          >);
    const now = inForce(levels, scope);
    const changed = new Set(changedFields(levels, scope).map(String));
    const vars = useMemo(
        () => resolveStyleVariables(style, styleOptions),
        [style, styleOptions],
    );
    const noun = button ? "button" : "photo";
    const label = textOf(own?.label) || textOf(own?.alt);

    /** Write one field at the chosen level; undefined takes it away. */
    function set(field: keyof ButtonLook, value: string | undefined) {
        if (scope === "site") {
            const key = button ? SITE_KEY[field] : ("images" as const);
            onSiteStyle(
                withComponents(style, compact({ ...site, [key]: value }) ?? {}),
            );
            return;
        }
        if (scope === "section") {
            const kind = element.kind;
            const nextKind = compact({
                ...(sectionStyles?.[kind] ?? {}),
                [field]: value,
            });
            onChange(
                withSectionStyles(section, {
                    ...sectionStyles,
                    [kind]: nextKind,
                }),
            );
            return;
        }
        onChange({
            ...section,
            content: withElementAt(section.content, element.path, (el) => {
                if (field === "style") {
                    return {
                        ...el,
                        style: CTA_OF_FILL[
                            (value ?? "filled") as keyof typeof CTA_OF_FILL
                        ],
                    };
                }
                const nextOwn = compact({
                    ...((el.elementStyle as object | undefined) ?? {}),
                    [field]: value,
                });
                const { elementStyle: _old, ...rest } = el;
                return nextOwn ? { ...rest, elementStyle: nextOwn } : rest;
            }),
        } as Section);
    }

    function reset() {
        if (scope === "site") {
            const keys = button
                ? Object.values(SITE_KEY)
                : (["images"] as const);
            const next = { ...site } as Record<string, unknown>;
            for (const k of keys) delete next[k];
            onSiteStyle(withComponents(style, next));
        } else if (scope === "section") {
            onChange(
                withSectionStyles(section, {
                    ...sectionStyles,
                    [element.kind]: undefined,
                }),
            );
        } else {
            onChange({
                ...section,
                content: withElementAt(section.content, element.path, (el) => {
                    const { elementStyle: _gone, ...rest } = el;
                    return rest.style === "soft"
                        ? { ...rest, style: "primary" }
                        : rest;
                }),
            } as Section);
        }
    }

    const scopes: { value: StyleScope; label: string; line: string }[] = [
        {
            value: "element",
            label: `This ${noun}`,
            line: label
                ? `Only “${label}” changes.`
                : `Only this ${noun} changes.`,
        },
        {
            value: "section",
            label: "This section",
            line: `Every ${noun} in ${sectionName}.`,
        },
        {
            value: "site",
            label: "Whole site",
            line: `Every ${noun} on the site · Brand › Buttons and shapes.`,
        },
    ];
    const resetWord =
        scope === "element"
            ? `Reset this ${noun}`
            : scope === "section"
              ? `Reset ${noun}s in ${sectionName}`
              : `Reset every ${noun}`;
    const changeLine = `${count(changed.size, "change")} from ${lookName}`;
    const resetButton =
        changed.size > 0 && !readOnly ? (
            <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0 font-semibold"
                onClick={reset}
            >
                {resetWord}
            </Button>
        ) : null;

    const ids = useId();
    const heading = (id: string, text: string, key: string) => (
        <p
            id={`${ids}-${id}`}
            className="mb-2 flex items-center gap-1.5 text-sm font-semibold"
        >
            {text}
            {changed.has(key) ? (
                <span
                    data-style-changed={key}
                    className="rounded-full bg-highlight-subtle px-2 text-xs font-semibold leading-[18px] text-highlight-subtle-foreground"
                >
                    Changed
                </span>
            ) : null}
        </p>
    );

    const colour = now.colour ?? "accent";
    const reading = button ? readableLine(colour, vars) : null;

    return (
        <div className="grid gap-5" data-element-style={element.kind}>
            <fieldset disabled={readOnly} className="contents">
                <div>
                    {heading("scope", "Apply to", "")}
                    <Segmented<StyleScope>
                        label="Apply to"
                        aria-labelledby={`${ids}-scope`}
                        value={scope}
                        block
                        size="md"
                        onValueChange={onScope}
                        options={scopes.map(({ value, label: l }) => ({
                            value,
                            label: l,
                        }))}
                    />
                    <p className="mt-1.5 text-xs text-muted-foreground">
                        {scopes.find((s) => s.value === scope)?.line}
                    </p>
                </div>

                {button ? (
                    <>
                        <div>
                            {heading("colour", "Colour", "colour")}
                            <ColourRow
                                labelledBy={`${ids}-colour`}
                                value={colour}
                                vars={vars}
                                allowCustom={scope !== "site"}
                                onChange={(v) => set("colour", v)}
                            />
                            {reading ? (
                                <ReadableLine
                                    ratio={reading.ratio}
                                    light={reading.light}
                                />
                            ) : null}
                        </div>

                        <div>
                            {heading("style", "Style", "style")}
                            <StyleTiles
                                labelledBy={`${ids}-style`}
                                value={now.style ?? "filled"}
                                fill={reading?.fill}
                                ink={reading?.ink}
                                onChange={(v) => set("style", v)}
                            />
                        </div>
                    </>
                ) : null}

                <div>
                    {heading("corners", "Corners", "corners")}
                    <Segmented
                        label="Corners"
                        aria-labelledby={`${ids}-corners`}
                        block
                        size="md"
                        value={now.corners ?? ""}
                        onValueChange={(v) => set("corners", v)}
                        options={(button
                            ? COMPONENT_STYLE_OPTIONS.buttons
                            : COMPONENT_STYLE_OPTIONS.images
                        ).map((v) => ({
                            value: v,
                            label: (
                                COMPONENT_OPTION_LABELS[
                                    button ? "buttons" : "images"
                                ] as Record<string, string>
                            )[v],
                        }))}
                    />
                    <p className="mt-1.5 text-xs text-muted-foreground">
                        {button
                            ? `${lookName} draws buttons ${lookCorners(style.look, vars)}.`
                            : "Round is for people and product photos. A wide photo would lose its edges."}
                    </p>
                </div>

                {button ? (
                    <div>
                        {heading("size", "Size", "size")}
                        <Segmented
                            label="Size"
                            aria-labelledby={`${ids}-size`}
                            block
                            size="md"
                            value={now.size ?? "m"}
                            onValueChange={(v) => set("size", v)}
                            options={COMPONENT_STYLE_OPTIONS.buttonSize.map(
                                (v) => ({ value: v, label: v.toUpperCase() }),
                            )}
                        />
                        <p className="mt-1.5 text-xs text-muted-foreground">
                            On a phone every button stays at least 44px tall.
                        </p>
                    </div>
                ) : null}
            </fieldset>

            {foot ? (
                foot(
                    changeLine,
                    changed.size > 0 && !readOnly
                        ? { word: resetWord, run: reset }
                        : null,
                )
            ) : (
                <div
                    data-style-changes={changed.size}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-3 text-sm"
                >
                    <span className="min-w-0 flex-1">{changeLine}</span>
                    {resetButton}
                </div>
            )}
        </div>
    );
}

/** The section with its `frame.styles` replaced; empty ones left out. */
export function withSectionStyles(
    section: Section,
    styles: Partial<Record<keyof SectionStyles, unknown>> | undefined,
): Section {
    const content = { ...(section.content as Record<string, unknown>) };
    const frame = {
        ...((content.frame as Record<string, unknown> | undefined) ?? {}),
    };
    const kept = compact({ ...(styles ?? {}) });
    if (kept) frame.styles = kept;
    else delete frame.styles;
    if (Object.keys(frame).length > 0) content.frame = frame;
    else delete content.frame;
    return { ...section, content } as Section;
}

/** "White words read clearly (4.9 : 1)", always shown (CS1). */
function ReadableLine({ ratio, light }: { ratio: number; light: boolean }) {
    const ok = ratio >= 4.5;
    return (
        <p
            data-readable={ok ? "yes" : "no"}
            className={cn(
                "mt-2 flex items-center gap-1.5 text-xs",
                ok ? "text-success" : "text-destructive",
            )}
        >
            {ok ? (
                <Check aria-hidden className="size-3.5" />
            ) : (
                <TriangleAlert aria-hidden className="size-3.5" />
            )}
            {light ? "White" : "Dark"} words{" "}
            {ok ? "read clearly" : "are hard to read"} ({ratio.toFixed(1)} : 1)
        </p>
    );
}

/** The site's colour roles as swatches, then Custom (CSI-C). */
function ColourRow({
    labelledBy,
    value,
    vars,
    allowCustom,
    onChange,
}: {
    labelledBy: string;
    value: string;
    vars: Readonly<Record<string, string>>;
    allowCustom: boolean;
    onChange: (next: string) => void;
}) {
    const custom = normalizeHex(value);
    return (
        <div className="flex flex-wrap items-start gap-0.5">
            <ChoiceGroup
                labelledBy={labelledBy}
                value={custom ? null : value}
                onChange={onChange}
                className="flex flex-wrap gap-0.5"
                itemClassName={(on) =>
                    cn(
                        "flex w-[52px] flex-col items-center gap-1 rounded-lg text-[11px] tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        on
                            ? "font-semibold text-foreground"
                            : "text-muted-foreground",
                    )
                }
                choices={ROLES.map((r) => ({
                    value: r.value,
                    ariaLabel: r.label,
                    data: { "data-colour-role": r.value },
                    label: (
                        <>
                            <span
                                aria-hidden
                                className={cn(
                                    "size-10 rounded-lg border",
                                    value === r.value &&
                                        "ring-2 ring-foreground ring-offset-2 ring-offset-background",
                                )}
                                style={{ background: roleFill(vars, r.value) }}
                            />
                            {r.label}
                        </>
                    ),
                }))}
            />
            {allowCustom ? (
                <CustomColour value={custom} onUse={onChange} />
            ) : null}
        </div>
    );
}

/**
 * Custom: a colour typed or picked, checked as it is picked (CS4). White
 * words that don't read show the two fixes; "Use this colour" waits for
 * one, so an unreadable button is never saved.
 */
function CustomColour({
    value,
    onUse,
}: {
    value: string | null;
    onUse: (hex: string) => void;
}) {
    const hexId = useId();
    const [open, setOpen] = useState(false);
    const [typed, setTyped] = useState(value ?? "#A65E3F");
    const [fix, setFix] = useState<"dark" | "darken" | null>(null);
    const hex = normalizeHex(typed);
    const words = hex ? customColourWords(hex) : null;
    const whiteReads = words?.words === "light" && words.readable;
    const shade = hex && !whiteReads ? darkenToRead(hex) : null;
    const canUse =
        hex !== null &&
        (whiteReads ||
            (fix === "dark" && words?.readable === true) ||
            fix === "darken");
    const use = () => {
        if (!hex) return;
        onUse(fix === "darken" && shade ? shade : hex);
        setOpen(false);
        setFix(null);
    };
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    data-colour-custom=""
                    aria-pressed={value !== null}
                    className={cn(
                        "flex w-[52px] flex-col items-center gap-1 rounded-lg text-[11px] tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        value
                            ? "font-semibold text-foreground"
                            : "text-muted-foreground",
                    )}
                >
                    <span
                        aria-hidden
                        className={cn(
                            "grid size-10 place-items-center rounded-lg border bg-card",
                            value &&
                                "ring-2 ring-foreground ring-offset-2 ring-offset-background",
                        )}
                        style={value ? { background: value } : undefined}
                    >
                        {value ? null : <Plus className="size-4" />}
                    </span>
                    Custom
                </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="grid w-80 gap-3">
                <p className="text-sm font-semibold">Custom colour</p>
                <div className="flex items-end gap-2">
                    <div className="grid flex-1 gap-1">
                        <Label htmlFor={`${hexId}-hex`}>Colour</Label>
                        <Input
                            id={`${hexId}-hex`}
                            value={typed}
                            onChange={(e) => {
                                setTyped(e.target.value);
                                setFix(null);
                            }}
                            aria-label="Colour, as six letters and numbers"
                            className="font-mono"
                        />
                    </div>
                    <input
                        type="color"
                        aria-label="Pick a colour"
                        value={hex ?? "#000000"}
                        onChange={(e) => {
                            setTyped(e.target.value.toUpperCase());
                            setFix(null);
                        }}
                        className="h-11 w-11 cursor-pointer rounded-md border bg-card p-1"
                    />
                </div>
                {hex && words && !whiteReads ? (
                    <div
                        role="alert"
                        className="grid gap-2 rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive"
                    >
                        <span>
                            <b>White words on this colour are hard to read</b> (
                            {contrastRatio("#FFFFFF", hex).toFixed(1)} : 1, it
                            needs 4.5 : 1). Pick one:
                        </span>
                        {words.words === "dark" && words.readable ? (
                            <FixRow
                                on={fix === "dark"}
                                onClick={() => setFix("dark")}
                                fill={hex}
                                ink={words.ink}
                                text="Keep the colour, dark words"
                                ratio={words.ratio}
                            />
                        ) : null}
                        {shade ? (
                            <FixRow
                                on={fix === "darken"}
                                onClick={() => setFix("darken")}
                                fill={shade}
                                ink="#FFFFFF"
                                text={`Darken it to ${shade}`}
                                ratio={customColourWords(shade).ratio}
                            />
                        ) : null}
                    </div>
                ) : null}
                <div className="flex justify-end gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => setOpen(false)}
                    >
                        Cancel
                    </Button>
                    <Button type="button" disabled={!canUse} onClick={use}>
                        Use this colour
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
}

function FixRow({
    on,
    onClick,
    fill,
    ink,
    text,
    ratio,
}: {
    on: boolean;
    onClick: () => void;
    fill: string;
    ink: string;
    text: string;
    ratio: number;
}) {
    return (
        <button
            type="button"
            aria-pressed={on}
            onClick={onClick}
            className={cn(
                "flex min-h-11 w-full items-center gap-2.5 rounded-md border bg-card px-2.5 py-1.5 text-left text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                on && "border-foreground ring-1 ring-foreground",
            )}
        >
            <span
                aria-hidden
                className="inline-flex h-6 w-12 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                style={{ background: fill, color: ink }}
            >
                Book
            </span>
            {text}
            <span className="ml-auto whitespace-nowrap text-xs font-semibold text-success">
                {ratio.toFixed(1)} : 1
            </span>
        </button>
    );
}

/** Filled, Outline, Soft, Link, each a "Book" drawn that way (CS1). */
function StyleTiles({
    labelledBy,
    value,
    fill = "hsl(var(--foreground))",
    ink = "hsl(var(--background))",
    onChange,
}: {
    labelledBy: string;
    value: string;
    fill?: string;
    ink?: string;
    onChange: (next: string) => void;
}) {
    const mini: Record<string, CSSProperties> = {
        filled: { background: fill, color: ink },
        outline: { border: `1.5px solid ${fill}`, color: "inherit" },
        soft: {
            background: `color-mix(in srgb, ${fill} 16%, transparent)`,
            color: "inherit",
        },
        link: { textDecoration: `underline ${fill}`, color: "inherit" },
    };
    return (
        <ChoiceGroup
            labelledBy={labelledBy}
            value={value}
            onChange={onChange}
            className="grid grid-cols-4 gap-1.5"
            itemClassName={(on) =>
                cn(
                    "flex min-h-11 flex-col items-center gap-1.5 rounded-lg border bg-card px-1 pb-2 pt-2.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    on
                        ? "border-foreground font-semibold text-foreground ring-1 ring-inset ring-foreground"
                        : "text-muted-foreground",
                )
            }
            choices={COMPONENT_STYLE_OPTIONS.buttonStyle.map((v) => ({
                value: v,
                data: { "data-button-style": v },
                label: (
                    <>
                        <span
                            aria-hidden
                            className="flex h-[22px] w-14 items-center justify-center rounded-full text-[10px] font-semibold"
                            style={mini[v]}
                        >
                            Book
                        </span>
                        {COMPONENT_OPTION_LABELS.buttonStyle[v]}
                    </>
                ),
            }))}
        />
    );
}
