"use client";

import type { ComponentStyles, SectionStyles } from "@saroh/block-contract";
import {
    COMPONENT_OPTION_LABELS,
    COMPONENT_STYLE_OPTIONS,
    LOOKS,
    normalizeHex,
    sectionFrameSettingsOf,
} from "@saroh/block-contract";
import { Button } from "@saroh/ui/button";
import { ChoiceGroup } from "@saroh/ui/choice-group";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { cn } from "@saroh/ui/lib/utils";
import { Segmented } from "@saroh/ui/segmented";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

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
    elementMark,
    elementsOf,
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
import { CustomColour, ReadableLine } from "./button-colour-picker";
import { ShadeStrip } from "./shade-strip";

/** The Colour row's roles, in the board's order (ERVPalette, with Brand tint). */
const ROLES = [
    { value: "bg", label: "Background" },
    { value: "surface", label: "Panels" },
    { value: "fg", label: "Text" },
    { value: "accent", label: "Brand" },
    { value: "tint", label: "Brand tint" },
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
    /**
     * A custom colour being picked, drawn on the canvas unsaved (CSI-C
     * states 2 and 3); null when the picker shuts.
     */
    onTry?: (next: Section | null) => void;
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
    onTry,
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
        onChange(sectionWith(field, value));
    }

    /** The section with one field written at this element or section. */
    function sectionWith(
        field: keyof ButtonLook,
        value: string | undefined,
    ): Section {
        if (scope === "section") {
            const kind = element.kind;
            const nextKind = compact({
                ...(sectionStyles?.[kind] ?? {}),
                [field]: value,
            });
            return withSectionStyles(section, {
                ...sectionStyles,
                [kind]: nextKind,
            });
        }
        return {
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
        } as Section;
    }

    function reset(level: StyleScope = scope) {
        if (level === "site") {
            const keys = button
                ? Object.values(SITE_KEY)
                : (["images"] as const);
            const next = { ...site } as Record<string, unknown>;
            for (const k of keys) delete next[k];
            onSiteStyle(withComponents(style, next));
        } else if (level === "section") {
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

    // "2 buttons in Hero" (CS2): how many this section's level reaches.
    const inSection = elementsOf(section.content).filter(
        (e) => e.kind === element.kind,
    ).length;
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
            line: `${count(inSection, noun)} in ${sectionName}.`,
        },
        {
            value: "site",
            label: "Whole site",
            line: `Every ${noun} on the site · Brand › Buttons and shapes.`,
        },
    ];
    const resetWords: Record<StyleScope, [string, string]> = {
        element: [
            `Reset this ${noun}`,
            label ? `Only ${label}` : `Only this ${noun}`,
        ],
        section: [`Reset ${noun}s in ${sectionName}`, count(inSection, noun)],
        site: [`Reset every ${noun}`, `Back to ${lookName} across the site`],
    };
    const resetWord = resetWords[scope][0];
    const changeLine = `${count(changed.size, "change")} from ${lookName}`;
    // Reset asks which level, as Apply to does (CSI-C states 4).
    const levelChanges = (level: StyleScope) =>
        changedFields(levels, level).length;
    const anyChange = (["element", "section", "site"] as const).some(
        (l) => levelChanges(l) > 0,
    );
    const resetMenu =
        anyChange && !readOnly ? (
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-auto p-0 font-semibold"
                        data-reset-levels=""
                    >
                        Reset
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                    {(["element", "section", "site"] as const).map((level) => (
                        <DropdownMenuItem
                            key={level}
                            disabled={levelChanges(level) === 0}
                            onSelect={() => reset(level)}
                            className="flex-col items-start gap-0"
                            data-reset-level={level}
                        >
                            <span className="font-semibold">
                                {resetWords[level][0]}
                            </span>
                            <span className="text-xs text-muted-foreground">
                                {resetWords[level][1]}
                            </span>
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
        ) : null;
    const tryRef = useRef(onTry);
    useEffect(() => {
        tryRef.current = onTry;
    });

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
                    className="rounded-full bg-muted px-2 text-xs font-semibold leading-[18px] text-foreground"
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
                                about={`${scopes.find((s) => s.value === scope)?.label ?? ""}`}
                                onOpen={() => revealElement(element)}
                                onChange={(v) => set("colour", v)}
                                onTry={(hex) =>
                                    tryRef.current?.(
                                        hex ? sectionWith("colour", hex) : null,
                                    )
                                }
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
                        ? { word: resetWord, run: () => reset() }
                        : null,
                )
            ) : (
                <div
                    data-style-changes={changed.size}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-3 text-sm"
                >
                    {changed.size > 0 ? (
                        <span
                            aria-hidden
                            className="size-2 shrink-0 rounded-full bg-foreground"
                        />
                    ) : null}
                    <span className="min-w-0 flex-1">{changeLine}</span>
                    {resetMenu}
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

/**
 * On a phone the colour sheet covers the lower page: scroll the tapped
 * button to the top of the canvas so it stays in view above the sheet.
 */
function revealElement(el: SelectedElement) {
    document
        .querySelector(`[data-site-el="${elementMark(el)}"]`)
        ?.scrollIntoView({ block: "start", behavior: "smooth" });
}

/** The site's colour roles as swatches, then Custom (CSI-C). */
function ColourRow({
    labelledBy,
    value,
    vars,
    allowCustom,
    onChange,
    onTry,
    about,
    onOpen,
}: {
    labelledBy: string;
    value: string;
    vars: Readonly<Record<string, string>>;
    allowCustom: boolean;
    onChange: (next: string) => void;
    onTry: (hex: string | null) => void;
    about?: string;
    onOpen?: () => void;
}) {
    const custom = normalizeHex(value);
    // The shade strip sits under the role last chosen; a shade is a custom
    // colour, so a whole-site choice (roles only) has none.
    const [baseRole, setBaseRole] = useState(custom ? "accent" : value);
    const base = readableLine(baseRole, vars)?.fill ?? null;
    const baseLabel = ROLES.find((r) => r.value === baseRole)?.label ?? "Brand";
    return (
        <>
            <div className="flex flex-wrap items-start gap-0.5">
                <ChoiceGroup
                    labelledBy={labelledBy}
                    value={custom ? null : value}
                    onChange={(next) => {
                        setBaseRole(next);
                        onChange(next);
                    }}
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
                                    style={{
                                        background: roleFill(vars, r.value),
                                    }}
                                />
                                {r.label}
                            </>
                        ),
                    }))}
                />
                {allowCustom ? (
                    <CustomColour
                        value={custom}
                        start={readableLine(value, vars)?.fill ?? "#A65E3F"}
                        role={custom ? null : value}
                        roles={ROLES.map((r) => ({
                            value: r.value,
                            label:
                                r.value === "accent" ? "Brand colour" : r.label,
                            hex: readableLine(r.value, vars)?.fill ?? null,
                        }))}
                        onRole={onChange}
                        onUse={onChange}
                        onTry={onTry}
                        about={about}
                        onOpen={onOpen}
                    />
                ) : null}
            </div>
            {allowCustom && base ? (
                <ShadeStrip
                    label={baseLabel}
                    base={base}
                    current={custom}
                    onRole={() => onChange(baseRole)}
                    onShade={onChange}
                />
            ) : null}
        </>
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
