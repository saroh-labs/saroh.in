"use client";

import type { LookId, SitePalette } from "@saroh/block-contract";
import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { TabStrip } from "@saroh/ui/tabs";
import type { ReactNode } from "react";
import { useId, useState } from "react";

import { SAVE_LINES } from "@/components/sites/shell/save-footer";
import { mediaSrc } from "@/lib/media/media-src";
import { colourName } from "@/lib/share-item/share";
import type { SiteStyle, SiteStyleOptions } from "@/lib/sites/style";
import { activeColourway, contrastOk, inColourway } from "@/lib/sites/style";
import type { PaidKind, StyleChoiceRules } from "@/lib/sites/style-access";
import { ALL_FREE } from "@/lib/sites/style-access";
import type { SiteIconSource } from "./brand-groups";
import {
    BrandColourButton,
    BrandGroup,
    ColourwayChips,
    LogoGroup,
} from "./brand-groups";
import { BrandInline } from "./brand-picker";
import type { ColourPart } from "./brand-sheet-parts";
import { PhoneColours } from "./brand-sheet-parts";
import { Chip, ColourRow, SwatchGrid, unreadableWords } from "./colour-picker";
import { ComponentStyleList, ComponentStylesRow } from "./component-styles";
import { DraftTools } from "./draft-tools";
import type { LookChanges } from "./look-changes";
import { LookChangesPanel, ROW_NAMES } from "./look-changes";
import type { LookChoices } from "./look-picker";
import { lookChoices, lookName, LookPicker } from "./look-picker";
import { PaidRefusal } from "./paid-refusal";
import { planLines, PlanSummary } from "./plan-summary";
import { TypefacePicker } from "./typeface-picker";

export { BrandSheetActions, resetBody, resetTitle } from "./brand-sheet-parts";
export { ROW_NAMES } from "./look-changes";

/** The template colour a palette puts where each row's would be. */
const PALETTE_OF: Record<string, keyof SitePalette> = {
    pageGround: "bg",
    text: "fg",
    accent: "accent",
    heroBackground: "heroBg",
    ctaBand: "ctaBg",
    footer: "footerBg",
};

/** Brand's props: the desk panel's, and the phone sheet's (`BrandPhone`). */
export interface BrandPanelProps {
    /** The template line (DEC-216): the Look group's last line; null draws none. */
    templateRow?: ReactNode;
    style: SiteStyle;
    options: SiteStyleOptions;
    onChange: (next: SiteStyle) => void;
    /** Reset to <look>: asks first, then offers Undo. */
    onReset: () => void;
    saving: boolean;
    /** A change not saved yet (or refused): no "Saved" for it. */
    dirty?: boolean;
    /** The Look group's facts and its choice; absent draws no looks. */
    looks?: LookChoices;
    /** Which choices are paid, and refused on this plan (DEC-177). */
    rules?: StyleChoiceRules;
    /** Draw a style on the page unsaved (a pair tried); null ends it. */
    onTry?: (next: SiteStyle | null) => void;
    /** The page's top draws in the text colour: its row moves nothing. */
    heroInText?: boolean;
    /** The phone's Brand sheet (`WXBBrandPhone`): one group at a time. */
    phoneTabs?: boolean;
    /** This visit's changes (`useEditorStyle().lookChanges`), each with Undo. */
    changes?: LookChanges;
    /** The site and its tab icon: draws Logo and tab icon. */
    siteIcon?: SiteIconSource;
    /**
     * The host draws "On your plan" and "Changes to the look" in the
     * inspector's place (`BrandAside`), so the panel leaves them out.
     */
    asideHosted?: boolean;
}

/**
 * Brand (U24b, boards `WXBBrand`, `WXBBrandColour`, `WXBBrandLocked`,
 * `WXBBrandPhone`): one panel for a whole site's look, in groups, each a
 * row with the choice in force whose options open from it (`BrandPicker`)
 * — Look, Colours, Fonts, Logo and tab icon, Buttons and shapes — with
 * Versions at its foot, and "Changes to the look" with Reset to <look>
 * beside it.
 *
 * Curated, not free: colours are the template's colourways, six rows of
 * five swatches from the palette the API serves, or a palette made from
 * one brand colour that the API makes again and holds to 4.5:1. No colour
 * a merchant picks can leave words unreadable.
 *
 * The px sliders are gone (RULES §3): spacing is Buttons and shapes ›
 * Spacing (Airy, Standard, Compact), corners are Buttons, Card corners
 * and Images, heading size is Headings. A site that stored slider values
 * keeps them (the renderer reads `scalars` as ever) until Reset to <look>
 * puts them back.
 *
 * Looks, fonts and colourways are free or paid (DEC-177, `rules`): a paid
 * one is marked, and on a plan without it choosing it is refused here,
 * before anything saves. The previous choice stays, and one line where it
 * was pressed says why, with the way to plans. Colours, your brand
 * colour, buttons and shapes are never paid.
 *
 * Every change applies to the preview at once: the values resolve into
 * `--site-*` custom properties on the preview subtree.
 */
export function StylePanel({
    style,
    options,
    onChange,
    onReset,
    saving,
    looks,
    rules = ALL_FREE,
    onTry,
    heroInText = false,
    phoneTabs = false,
    templateRow = null,
    changes,
    siteIcon,
    asideHosted = false,
}: BrandPanelProps) {
    // The paid choice just refused, and where: one line, by that control.
    const [refused, setRefused] = useState<{
        kind: PaidKind;
        name: string;
    } | null>(null);
    const [editing, setEditing] = useState(false);
    const rowsId = useId();
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
     * Which text swatch is actually in force: a style saved by an older
     * client can hold a pair the renderer corrects, and the panel follows
     * the preview rather than marking a disabled swatch as chosen.
     */
    const storedTextHsl = hslOf("text", style.colours.text);
    const effectiveTextKey =
        storedTextHsl && !textReadable(storedTextHsl)
            ? (swatchesFor("text").find((sw) => textReadable(sw.hsl))?.key ??
              style.colours.text)
            : style.colours.text;

    const colourways = options.colourways ?? [];
    const current = activeColourway(style, colourways);
    // A colourway's or a brand colour's palette replaces the rows' colours.
    const paletteOn = style.palette !== undefined;

    /** The rows' colours: no colourway, no brand colour. */
    function ownColours(): SiteStyle {
        const {
            palette: _palette,
            type: _type,
            brandColour: _brand,
            ...rest
        } = style;
        return rest;
    }

    function setColour(row: string, key: string) {
        const next = ownColours();
        next.colours = { ...style.colours, [row]: key };
        /*
         * Page ground and text are independent, so a new ground can make the
         * current text unreadable. Move the text to a legible option here,
         * so the merchant sees the swatch move.
         */
        if (row === "pageGround") {
            const ground = hslOf("pageGround", key);
            const text = hslOf("text", style.colours.text);
            if (ground && text && !contrastOk(ground, text)) {
                const legible = swatchesFor("text").find((sw) =>
                    contrastOk(ground, sw.hsl),
                );
                if (legible) next.colours.text = legible.key;
            }
        }
        onChange(next);
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

    const saveLine = saving ? "Saving…" : SAVE_LINES["waits-for-publish"];

    // The six colours, each a part: a row that opens on a desk, a chip
    // over its swatches on a phone (DEC-185).
    const parts: ColourPart[] = options.rows.map((row): ColourPart => {
        const label = ROW_NAMES[row.key] ?? row.label;
        const value =
            row.key === "text" ? effectiveTextKey : style.colours[row.key];
        const swatch = swatchOf(row.key, value);
        const template = paletteOn
            ? style.palette?.[PALETTE_OF[row.key]]
            : undefined;
        const unreadable = (sw: { hsl: string }) =>
            row.key === "text" && !textReadable(sw.hsl);
        const locked =
            ground && row.key === "text" ? row.swatches.filter(unreadable) : [];
        return {
            key: row.key,
            label,
            note:
                row.key === "text" && ground ? `on ${ground.label}` : undefined,
            chip: (
                <Chip
                    fill={
                        template ?? (swatch ? `hsl(${swatch.hsl})` : undefined)
                    }
                />
            ),
            value: template ? "From your colours" : (swatch?.label ?? ""),
            foot:
                ground && locked.length > 0
                    ? locked.map((sw) => (
                          <p key={sw.key}>{unreadableWords(sw, ground)}</p>
                      ))
                    : undefined,
            hint:
                row.key === "heroBackground" && heroInText
                    ? "This top of the page uses your text colour. Change it in its section."
                    : undefined,
            content: (
                <SwatchGrid
                    label={label}
                    swatches={row.swatches}
                    value={paletteOn ? null : value}
                    disabled={unreadable}
                    onChoose={(key) => setColour(row.key, key)}
                />
            ),
        };
    });
    const paletteLine = paletteOn ? (
        <p className="text-xs text-muted-foreground">
            {style.brandColour
                ? "These colours are made from your brand colour."
                : current
                  ? `The ${current.name} colours are your template's own.`
                  : "These colours are your template's own."}{" "}
            Choose a colour in a row to use your own instead.
        </p>
    ) : null;

    const chips = (
        <ColourwayChips
            style={style}
            colourways={colourways}
            current={current}
            paidMark={(id) => paidMark("colourway", id)}
            onColourway={(cw) => {
                if (!allowed("colourway", cw.id, cw.name)) return;
                onChange(inColourway(style, cw));
            }}
            onOwn={() => {
                setRefused(null);
                if (paletteOn) onChange(ownColours());
            }}
        />
    );
    const logoUrl =
        mediaSrc(siteIcon?.saved.businessLogoUrl) ??
        mediaSrc(siteIcon?.saved.own?.url) ??
        null;
    const brandColour = (
        <BrandColourButton
            style={style}
            onChange={onChange}
            onTry={onTry}
            logoUrl={logoUrl}
        />
    );
    const coloursNote = style.brandColour
        ? `from your ${colourName(style.brandColour).toLowerCase()}`
        : undefined;

    // The Look group, when there is a look to offer (DEC-172).
    const lookPart =
        looks &&
        lookChoices({
            available: looks.available,
            draftLook: style.look ?? null,
            liveLook: looks.liveLook,
        }).length > 0 ? (
            <LookPicker
                style={style}
                options={options}
                {...looks}
                rules={rules}
                refused={refusedOf("look")}
                onChoose={(look: LookId | null, keepComponents?: boolean) => {
                    if (look && !allowed("look", look, lookName(look))) {
                        return;
                    }
                    if (!look) setRefused(null);
                    if (keepComponents === false) looks.onChoose(look, false);
                    else looks.onChoose(look);
                }}
            />
        ) : null;
    // Looks first, the template it started from as the group's last line.
    const lookGroup =
        lookPart || templateRow ? (
            <div className="space-y-2" data-brand-look="">
                {lookPart ?? (
                    <h3
                        className={
                            phoneTabs ? "sr-only" : "text-sm font-semibold"
                        }
                    >
                        Look
                    </h3>
                )}
                {templateRow}
            </div>
        ) : null;
    // The pairing picker (DEC-046); an older API serving no pairs shows none.
    const fontsGroup =
        fontPairs.length > 0 ? (
            <TypefacePicker
                pairs={fontPairs}
                active={activePair}
                rules={rules}
                refused={refusedOf("fontPair")}
                onChoose={setFontPair}
                onTry={
                    onTry
                        ? (key) => onTry(key === null ? null : withPair(key))
                        : undefined
                }
            />
        ) : null;
    const logoGroup = siteIcon ? (
        <LogoGroup
            icon={siteIcon}
            style={style}
            options={options}
            hideTitle={phoneTabs}
        />
    ) : null;
    const versions = looks?.preview?.starter ? (
        <DraftTools starter={looks.preview.starter} lookName={lookName} />
    ) : null;

    if (phoneTabs) {
        return (
            <BrandPhoneSheet
                groups={{
                    look: lookGroup ? (
                        <>
                            {lookGroup}
                            {versions}
                        </>
                    ) : null,
                    colours: (
                        <BrandGroup
                            title="Colours"
                            note={coloursNote}
                            hideTitle
                        >
                            {chips}
                            {colourwayRefused ? (
                                <PaidRefusal name={colourwayRefused} />
                            ) : null}
                            {paletteLine}
                            <PhoneColours parts={parts} />
                            {brandColour}
                        </BrandGroup>
                    ),
                    fonts: fontsGroup,
                    logo: logoGroup,
                    shapes: (
                        <ComponentStyleList style={style} onChange={onChange} />
                    ),
                }}
                saveLine={saveLine}
                changes={changes}
            />
        );
    }

    const aside = asideHosted ? null : (
        <BrandAside
            style={style}
            options={options}
            rules={rules}
            looksOffered={lookPart !== null}
            changes={changes}
            onReset={onReset}
        />
    );

    return (
        /*
         * The rail's Brand tab names this panel and is the way back to the
         * page's sections, so it carries no header or Back of its own.
         */
        <div
            className="relative flex min-h-0 flex-1 flex-col"
            data-brand-panel=""
        >
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-3 [&>*+*]:border-t [&>*+*]:pt-4">
                {lookGroup}
                <BrandGroup
                    title="Colours"
                    note={coloursNote}
                    action={
                        <Button
                            type="button"
                            variant="link"
                            size="inline"
                            aria-expanded={editing}
                            aria-controls={rowsId}
                            data-edit-colours=""
                            // A quiet underlined link (B5): 12px, the
                            // smallest text the editor draws.
                            className="text-xs font-normal underline underline-offset-2"
                            onClick={() => setEditing((on) => !on)}
                        >
                            {editing ? "Done" : "Edit each colour"}
                        </Button>
                    }
                >
                    {chips}
                    {colourwayRefused ? (
                        <PaidRefusal name={colourwayRefused} />
                    ) : null}
                    {paletteLine}
                    {editing ? (
                        <div
                            id={rowsId}
                            className="space-y-1"
                            data-colour-rows=""
                        >
                            {parts.map((part) => (
                                <div key={part.key} className="space-y-1">
                                    <ColourRow
                                        label={part.label}
                                        note={part.note}
                                        chip={part.chip}
                                        value={part.value}
                                        foot={part.foot}
                                        after={part.after}
                                    >
                                        {part.content}
                                    </ColourRow>
                                    {part.hint ? (
                                        <p
                                            data-hero-hint=""
                                            className="px-0.5 text-[0.71875rem] leading-snug text-muted-foreground"
                                        >
                                            {part.hint}
                                        </p>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    ) : null}
                    {brandColour}
                </BrandGroup>
                {fontsGroup}
                {logoGroup}
                <ComponentStylesRow style={style} onChange={onChange} />
                {aside}
            </div>

            <div className="flex items-center justify-between gap-2 border-t p-3">
                <p
                    className="text-xs text-muted-foreground"
                    data-style-save-line=""
                    role="status"
                >
                    {saveLine}
                </p>
                {versions}
            </div>
        </div>
    );
}

/**
 * Beside Brand on a desk (`WXBBrand`, `WXBBrandLocked`): "On your plan"
 * when the plan leaves paid styles off, then "Changes to the look" and
 * Reset to <look>. The panel draws it under its groups unless the host
 * draws it in the inspector's place (`asideHosted`).
 */
export function BrandAside({
    style,
    options,
    rules = ALL_FREE,
    looksOffered,
    changes,
    onReset,
}: {
    style: SiteStyle;
    options: SiteStyleOptions;
    rules?: StyleChoiceRules;
    looksOffered: boolean;
    changes?: LookChanges;
    onReset: () => void;
}) {
    const lines = planLines(rules, options, looksOffered);
    return (
        <div className="space-y-5" data-brand-aside="">
            {lines ? <PlanSummary lines={lines} /> : null}
            <LookChangesPanel
                changes={changes}
                look={style.look}
                onReset={onReset}
            />
        </div>
    );
}

type PhoneGroup = "look" | "colours" | "fonts" | "logo" | "shapes";
const PHONE_TABS: { key: PhoneGroup; label: string }[] = [
    { key: "look", label: "Look" },
    { key: "colours", label: "Colours" },
    { key: "fonts", label: "Fonts" },
    { key: "logo", label: "Logo" },
    { key: "shapes", label: "Buttons and shapes" },
];

/**
 * The phone's Brand sheet (`WXBBrandPhone`): one group at a time behind a
 * strip, and a foot saying where a change goes with Undo for the last one.
 * Opens on Colours, as the board does.
 */
function BrandPhoneSheet({
    groups,
    saveLine,
    changes,
}: {
    groups: Record<PhoneGroup, ReactNode>;
    saveLine: string | null;
    changes?: LookChanges;
}) {
    const [tab, setTab] = useState<PhoneGroup>("colours");
    const tabs = PHONE_TABS.filter((t) => Boolean(groups[t.key]));
    const shown = tabs.some((t) => t.key === tab) ? tab : tabs[0].key;
    const last = changes?.list.at(0);
    return (
        <BrandInline.Provider value>
            <div className="flex min-h-0 flex-1 flex-col" data-brand-phone="">
                <TabStrip
                    label="Brand"
                    value={shown}
                    onValueChange={setTab}
                    className="shrink-0"
                    listClassName="px-2"
                    tabs={tabs.map((t) => ({ value: t.key, label: t.label }))}
                />
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                    {groups[shown]}
                </div>
                <div className="flex min-h-14 items-center gap-2 border-t px-3 py-2">
                    <p
                        className="min-w-0 flex-1 text-xs text-muted-foreground"
                        data-style-save-line=""
                        role="status"
                    >
                        {saveLine}
                    </p>
                    {last ? (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="coarse:min-h-11"
                            aria-label={`Undo ${last.part}: ${last.words}`}
                            onClick={() => changes?.undo(last.id)}
                        >
                            Undo
                        </Button>
                    ) : null}
                </div>
            </div>
        </BrandInline.Provider>
    );
}
