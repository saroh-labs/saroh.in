"use client";

import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { Button } from "@saroh/ui/button";
import { Label } from "@saroh/ui/label";
import { cn } from "@saroh/ui/lib/utils";
import { Segmented } from "@saroh/ui/segmented";
import { Skeleton } from "@saroh/ui/skeleton";
import { TextLink } from "@saroh/ui/text-link";
import { Check, Eye, Info } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import { useId, useState } from "react";

import type { Template, TemplateColourway } from "@/lib/sites/service";
import type { ModuleStates, TemplateGroup } from "@/lib/sites/template-picker";
import { offReason, shapeWord, usesLine } from "@/lib/sites/template-picker";
import type { TemplateThumbnailImage } from "@/lib/sites/template-thumbnails";
import { templateThumbnail } from "@/lib/sites/template-thumbnails";

/**
 * The one template picker (DEC-216, board D3), in Turn on Website, New
 * site and the editor's Template preview: picture cards under "Suggested
 * for <trade>", the templates that need a module that is off each saying
 * why, and All one press away. The chosen card carries its colourways.
 *
 * Pressing a card, or its Preview, opens the preview (`onPreview`); the
 * radio beside the name chooses without it. One radio group for the cards
 * (arrow keys move the choice, Enter opens the preview) and one for the
 * chosen card's colourways, so it is a pair of form fields to a screen
 * reader. A module that is off is said, never refused (DEC-070).
 */
export function TemplatePicker({
    groups,
    value,
    onChange,
    styleId,
    onStyleChange,
    modules,
    onPreview,
    setTradeHref = null,
    disabled = false,
}: {
    /**
     * With no trade, where to set it (`org:update` only): the Suggested
     * heading says why it isn't the trade's and links there (DEC-216).
     */
    setTradeHref?: string | null;
    /** `templateGroups`: the suggested first. */
    groups: readonly TemplateGroup<Template>[];
    value: string;
    /** A template chosen, in its colourway (empty: its first). */
    onChange: (id: string, styleId: string) => void;
    /** The chosen colourway's id; empty for the template's first. */
    styleId: string;
    onStyleChange: (id: string) => void;
    /** The business's modules; null when they could not be read. */
    modules: ModuleStates | null;
    /** Open the template's preview; `from` gets the keyboard back. */
    onPreview: (id: string, from: HTMLElement) => void;
    disabled?: boolean;
}) {
    const id = useId();
    const all = groups.flatMap((g) => g.templates);
    const suggested = groups[0]?.key === "suggested" ? groups[0] : null;
    const narrowed =
        suggested !== null && suggested.templates.length < all.length;
    // Start on All when the one asked for (`?template=`) isn't suggested.
    const [show, setShow] = useState<"suggested" | "all">(() =>
        narrowed && suggested.templates.some((t) => t.id === value)
            ? "suggested"
            : "all",
    );
    const shown: TemplateGroup<Template>[] =
        show === "suggested" && narrowed
            ? [
                  {
                      ...suggested,
                      // A choice made under All is never hidden.
                      templates: [
                          ...suggested.templates,
                          ...all.filter(
                              (t) =>
                                  t.id === value &&
                                  !suggested.templates.includes(t),
                          ),
                      ],
                  },
              ]
            : [...groups];

    return (
        <div className="grid min-w-0 gap-3">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <span id={`${id}-label`} className="text-sm font-medium">
                    Template
                </span>
                {narrowed ? (
                    <Segmented
                        label="Templates shown"
                        value={show}
                        onValueChange={setShow}
                        options={[
                            {
                                value: "suggested",
                                label: `Suggested ${suggested.templates.length}`,
                            },
                            { value: "all", label: `All ${all.length}` },
                        ]}
                    />
                ) : null}
            </div>
            <RadioGroupPrimitive.Root
                aria-labelledby={`${id}-label`}
                value={value}
                // A new template starts in its own first colourway.
                onValueChange={(next) => onChange(next, "")}
                disabled={disabled}
                className="grid min-w-0 gap-4"
            >
                {shown.map((g) => (
                    <section
                        key={g.key}
                        aria-label={g.title}
                        className="grid min-w-0 gap-2"
                    >
                        <h3 className="text-[13px] font-medium text-muted-foreground">
                            {g.title}
                            {g.key === "suggested" && setTradeHref ? (
                                <span className="font-normal">
                                    {" · "}Tell us what kind of place this is
                                    for better suggestions ·{" "}
                                    <TextLink
                                        href={setTradeHref}
                                        className="text-[13px]"
                                        data-template-set-trade=""
                                    >
                                        Set it
                                    </TextLink>
                                </span>
                            ) : null}
                        </h3>
                        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                            {g.templates.map((t) => (
                                <TemplateCard
                                    key={t.id}
                                    template={t}
                                    selected={t.id === value}
                                    reason={offReason(t, modules)}
                                    onPreview={(from) => onPreview(t.id, from)}
                                >
                                    {t.id === value ? (
                                        <ColourwayChoice
                                            template={t}
                                            value={styleId}
                                            onChange={onStyleChange}
                                            disabled={disabled}
                                        />
                                    ) : null}
                                </TemplateCard>
                            ))}
                        </div>
                    </section>
                ))}
            </RadioGroupPrimitive.Root>
        </div>
    );
}

/** Card-shaped placeholders while the templates load, so nothing jumps. */
export function TemplatePickerSkeleton() {
    return (
        <div className="grid min-w-0 gap-3" aria-busy="true">
            <span className="text-sm font-medium">Template</span>
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                {[0, 1].map((i) => (
                    <div
                        key={i}
                        className="overflow-hidden rounded-lg border border-border"
                    >
                        <Skeleton className="aspect-video w-full rounded-none" />
                        <div className="grid gap-2 p-3">
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-3 w-full" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function TemplateCard({
    template,
    selected,
    reason,
    onPreview,
    children,
}: {
    template: Template;
    selected: boolean;
    reason: string | null;
    onPreview: (from: HTMLElement) => void;
    /** The colourways, on the chosen card. */
    children?: ReactNode;
}) {
    const id = useId();
    const uses = usesLine(template);
    const shape = shapeWord(template);
    const described = [
        template.description ? `${id}-desc` : null,
        uses ? `${id}-uses` : null,
        reason ? `${id}-reason` : null,
    ]
        .filter(Boolean)
        .join(" ");
    return (
        <div
            data-ph-mask=""
            data-template-card={template.id}
            className={cn(
                "relative flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card text-left text-sm transition-colors duration-fast",
                selected
                    ? "border-foreground ring-1 ring-foreground"
                    : "border-border hover:border-foreground/40",
            )}
        >
            <TemplateThumbnail
                name={template.name}
                colourway={template.colourways?.[0]}
                image={templateThumbnail(template.id)}
            />
            {/* The card's press: its ::after covers the card, under the radio. */}
            <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={`Preview ${template.name}`}
                data-template-preview-open={template.id}
                onClick={(e) => onPreview(e.currentTarget)}
                className="absolute right-2 top-2 bg-background/95 shadow-sm after:absolute after:inset-[-1000px] after:content-['']"
            >
                <Eye aria-hidden />
                Preview
            </Button>
            <span className="flex min-w-0 flex-col gap-1.5 p-3">
                <span className="relative z-10 flex min-w-0 items-center gap-2">
                    <RadioGroupPrimitive.Item
                        id={`${id}-radio`}
                        value={template.id}
                        aria-labelledby={`${id}-name`}
                        aria-describedby={described || undefined}
                        // Enter opens the preview (board D3); arrows choose.
                        onKeyDown={(e) => {
                            if (e.key === "Enter") onPreview(e.currentTarget);
                        }}
                        className="flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full border border-primary text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:text-disabled-foreground coarse:size-5"
                    >
                        <RadioGroupPrimitive.Indicator className="size-2 rounded-full bg-current" />
                    </RadioGroupPrimitive.Item>
                    <Label
                        data-ph-unmask=""
                        id={`${id}-name`}
                        htmlFor={`${id}-radio`}
                        className="min-w-0 cursor-pointer truncate text-sm font-medium"
                    >
                        {template.name}
                    </Label>
                    {shape ? (
                        <span className="ml-auto shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                            {shape}
                        </span>
                    ) : null}
                </span>
                {template.description ? (
                    <span
                        id={`${id}-desc`}
                        className="line-clamp-2 text-xs leading-normal text-muted-foreground"
                    >
                        {template.description}
                    </span>
                ) : null}
                {uses ? (
                    <span id={`${id}-uses`} className="text-xs text-foreground">
                        {uses}
                    </span>
                ) : null}
                {reason ? (
                    <span
                        id={`${id}-reason`}
                        className="flex items-start gap-1.5 text-xs leading-normal text-muted-foreground"
                    >
                        <Info
                            aria-hidden
                            className="mt-0.5 size-3.5 shrink-0"
                        />
                        {reason}
                    </span>
                ) : null}
                {children ? (
                    <span className="relative z-10 pt-1">{children}</span>
                ) : null}
            </span>
        </div>
    );
}

/**
 * The card's picture: the template's home page as the renderer draws it for
 * its sample business, captured at 2× (plan U14), when there is one.
 * Otherwise the template's first colourway drawn as a page: its ground, its
 * name in its text colour and a bar of its accent. A template with no
 * colourway is drawn in the workspace's own muted surface rather than an
 * invented palette.
 */
export function TemplateThumbnail({
    name,
    colourway,
    image,
}: {
    name: string;
    colourway?: TemplateColourway;
    /**
     * The template's home page as the renderer draws it (U14,
     * `lib/sites/template-thumbnails.ts`). Absent: the drawn card.
     */
    image?: TemplateThumbnailImage;
}) {
    if (image) {
        return (
            // Decorative: the card's name and description say what it is.
            <Image
                src={image.src}
                alt=""
                aria-hidden
                width={image.width}
                height={image.height}
                sizes="(min-width: 640px) 360px, 100vw"
                className="aspect-video w-full border-b border-border object-cover object-top"
            />
        );
    }
    const [ground, text, accent] = colourway?.chips ?? [];
    return (
        <span
            aria-hidden
            className={cn(
                "flex aspect-video w-full flex-col justify-between border-b border-border p-3",
                !ground && "bg-muted",
            )}
            style={ground ? { background: `hsl(${ground})` } : undefined}
        >
            <span className="flex items-center gap-1.5">
                {[0, 1, 2].map((i) => (
                    <span
                        key={i}
                        className={cn(
                            "h-1 w-6 rounded-full opacity-40",
                            !text && "bg-muted-foreground",
                        )}
                        style={
                            text ? { background: `hsl(${text})` } : undefined
                        }
                    />
                ))}
            </span>
            <span className="flex flex-col gap-2">
                <span
                    className={cn(
                        "truncate font-serif text-lg leading-tight",
                        !text && "text-foreground",
                    )}
                    style={text ? { color: `hsl(${text})` } : undefined}
                >
                    {name}
                </span>
                <span
                    className={cn(
                        "h-2 w-14 rounded-sm",
                        !accent && "bg-primary",
                    )}
                    style={
                        accent ? { background: `hsl(${accent})` } : undefined
                    }
                />
            </span>
        </span>
    );
}

/**
 * A template's colourways as a radio group, on its chosen card and in its
 * preview; nothing for a template with one or none. `value` empty is its
 * first.
 */
export function ColourwayChoice({
    template,
    value,
    onChange,
    disabled = false,
}: {
    template: Template;
    value: string;
    onChange: (id: string) => void;
    disabled?: boolean;
}) {
    const id = useId();
    const colourways = template.colourways ?? [];
    if (colourways.length < 2) return null;
    const chosen = value || colourways[0].id;
    return (
        <span className="grid min-w-0 gap-1.5">
            <span id={`${id}-label`} className="text-xs font-medium">
                {template.name} colourway
            </span>
            <RadioGroupPrimitive.Root
                aria-labelledby={`${id}-label`}
                value={chosen}
                onValueChange={onChange}
                disabled={disabled}
                // Two even columns, so the names line up instead of wrapping ragged.
                className="grid min-w-0 grid-cols-2 gap-2"
            >
                {colourways.map((cw) => {
                    const active = cw.id === chosen;
                    return (
                        <RadioGroupPrimitive.Item
                            key={cw.id}
                            value={cw.id}
                            className={cn(
                                "flex min-h-9 min-w-0 cursor-pointer items-center gap-1.5 rounded-md border bg-background px-2 py-1.5 text-sm transition-colors duration-fast coarse:min-h-11",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:text-disabled-foreground",
                                active
                                    ? "border-foreground ring-1 ring-foreground"
                                    : "border-border hover:bg-muted active:bg-accent-active",
                            )}
                        >
                            <span
                                aria-hidden
                                className="flex shrink-0 overflow-hidden rounded-sm border"
                            >
                                {cw.chips.map((hsl, i) => (
                                    <span
                                        key={i}
                                        className="h-5 w-2.5"
                                        style={{ background: `hsl(${hsl})` }}
                                    />
                                ))}
                            </span>
                            <span className="min-w-0 truncate">{cw.name}</span>
                            {active ? (
                                <Check
                                    aria-hidden
                                    className="ml-auto size-3.5 shrink-0"
                                />
                            ) : null}
                        </RadioGroupPrimitive.Item>
                    );
                })}
            </RadioGroupPrimitive.Root>
        </span>
    );
}
