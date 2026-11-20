"use client";

import type { SectionTone } from "@saroh/block-contract";
import {
    BLOCK_META,
    CLASSIC_COMPONENTS,
    COMPONENT_OPTION_LABELS,
    COMPONENT_STYLE_OPTIONS,
    LOOKS,
    resolveVariant,
} from "@saroh/block-contract";
import { Button } from "@saroh/ui/button";
import { ChipGroup } from "@saroh/ui/choice-group";
import { Segmented } from "@saroh/ui/segmented";
import { TextLink } from "@saroh/ui/text-link";

import { SectionPadding } from "@/components/sites/section-fields/padding";
import { withVariant } from "@/components/sites/section-fields/variant-field";
import { count } from "@/lib/format/plural";
import type { Section } from "@/lib/sites/service";
import type { SiteStyle, SiteStyleOptions } from "@/lib/sites/style";

import { useEditorReadOnly } from "../read-only";
import {
    frameOf,
    resetToLook,
    styleChanges,
    toneOf,
    withFrame,
    withTone,
} from "./section-frame";

/** Background, in the board's words (`fix/WXKStyle`). */
const TONES: { value: SectionTone; label: string }[] = [
    { value: "page", label: "Page" },
    { value: "tint", label: "Light tint" },
    { value: "brand", label: "Brand colour" },
    { value: "dark", label: "Dark" },
];

type SpacingChoice = "site" | (typeof COMPONENT_STYLE_OPTIONS.spacing)[number];

export interface StyleTabProps {
    section: Section;
    /** The site's saved look, for "Uses the site look". */
    style: SiteStyle;
    styleOptions: SiteStyleOptions;
    onChange: (next: Section) => void;
    /** "Change in Brand": open the Brand panel. */
    onOpenBrand?: () => void;
}

/**
 * Inspector › Style (U47, `fix/WXKStyle`): what this section changes from
 * the site look. Ways to show it is the block's own variants (none drawn for
 * a block with one); Background and Spacing are its frame (KTD-E5); its own
 * padding (#189) stays under Spacing. "n changes from the site look · Reset
 * to <look>" takes them all back. The phone's section sheet (U49) reuses it.
 */
export function StyleTab({
    section,
    style,
    styleOptions,
    onChange,
    onOpenBrand,
}: StyleTabProps) {
    const readOnly = useEditorReadOnly();
    const look = style.look ? LOOKS[style.look] : null;
    const lookName = look?.name ?? "Classic";
    const siteSpacing =
        style.components?.spacing ??
        (look?.components ?? CLASSIC_COMPONENTS).spacing;
    const siteSpacingWord = COMPONENT_OPTION_LABELS.spacing[siteSpacing];
    const variants = BLOCK_META[section.type].variants;
    const spacing: SpacingChoice = frameOf(section).spacing ?? "site";
    const changes = styleChanges(section);

    return (
        <div className="grid gap-5">
            <div className="grid gap-1 rounded-lg bg-muted p-3 text-[0.8125rem] leading-relaxed">
                <p className="font-semibold">Uses the site look</p>
                <p className="text-muted-foreground">
                    {lookName}, {siteSpacingWord} spacing
                </p>
                {onOpenBrand && !readOnly ? (
                    <TextLink
                        onClick={onOpenBrand}
                        className="justify-self-start"
                    >
                        Change in Brand
                    </TextLink>
                ) : null}
            </div>

            <fieldset disabled={readOnly} className="contents">
                {variants.length > 1 ? (
                    <div className="grid gap-2">
                        <p id="ways-to-show" className="text-sm font-semibold">
                            Ways to show it
                        </p>
                        <ChipGroup
                            labelledBy="ways-to-show"
                            value={resolveVariant(
                                section.type,
                                section.content,
                            )}
                            choices={variants.map((v) => ({
                                value: v.id,
                                label: v.label,
                                tip: v.description,
                            }))}
                            onChange={(id) =>
                                onChange(withVariant(section, id))
                            }
                            disabled={readOnly}
                        />
                    </div>
                ) : null}

                <div className="grid gap-2">
                    <p
                        id="section-background"
                        className="text-sm font-semibold"
                    >
                        Background
                    </p>
                    <ChipGroup
                        labelledBy="section-background"
                        value={toneOf(section)}
                        choices={TONES}
                        onChange={(tone) => onChange(withTone(section, tone))}
                        disabled={readOnly}
                    />
                    <p className="text-xs text-muted-foreground">
                        Only your site&apos;s colours, so every section stays in
                        step.
                    </p>
                </div>

                <div className="grid gap-2">
                    <Segmented<SpacingChoice>
                        label="Spacing"
                        value={spacing}
                        size="sm"
                        onValueChange={(next) =>
                            onChange(
                                withFrame(section, {
                                    spacing: next === "site" ? undefined : next,
                                }),
                            )
                        }
                        options={[
                            { value: "site", label: "Same as the site" },
                            ...COMPONENT_STYLE_OPTIONS.spacing.map((s) => ({
                                value: s,
                                label: COMPONENT_OPTION_LABELS.spacing[s],
                            })),
                        ]}
                    />
                    <p className="text-xs text-muted-foreground">
                        The site uses {siteSpacingWord}.
                    </p>
                    <SectionPadding
                        section={section}
                        siteDefault={style.scalars.sectionPadding}
                        bounds={styleOptions.scalars.find(
                            (sc) => sc.key === "sectionPadding",
                        )}
                        onChange={onChange}
                    />
                </div>
            </fieldset>

            {changes > 0 ? (
                <div
                    data-style-changes={changes}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-3 text-sm"
                >
                    <span className="min-w-0 flex-1">
                        {count(changes, "change")} from the site look
                    </span>
                    {readOnly ? null : (
                        <Button
                            type="button"
                            variant="link"
                            size="sm"
                            className="h-auto p-0 font-semibold"
                            onClick={() => onChange(resetToLook(section))}
                        >
                            Reset to {lookName}
                        </Button>
                    )}
                </div>
            ) : null}
        </div>
    );
}
