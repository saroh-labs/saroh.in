"use client";

import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { cn } from "@saroh/ui/lib/utils";
import { Check, Info } from "lucide-react";
import { useId, useState } from "react";

import type { Template, TemplateColourway } from "@/lib/sites/service";
import type { ModuleStates } from "@/lib/sites/template-picker";
import { moduleNote, shapeWord, usesLine } from "@/lib/sites/template-picker";

/**
 * The template picker (industry templates plan, U12): a grid of cards, one
 * per template, shown first as the ones suggested for this business, with
 * "All templates" a click away. Under the grid, the chosen template's
 * colourways. A card whose sections need a module that is off says so and
 * is still chosen like any other (DEC-070: the kind and the modules suggest,
 * they never refuse).
 *
 * One radio group for the cards and one for the colourways (Radix: arrow
 * keys move and choose, Tab leaves the group), so it is a pair of form
 * fields to a screen reader rather than a wall of buttons.
 */
export function TemplatePicker({
    templates,
    suggested,
    value,
    onChange,
    styleId,
    onStyleChange,
    modules,
    disabled = false,
}: {
    /** Every template, in the catalogue's order. */
    templates: readonly Template[];
    /** The ids suggested for this business, the default first. */
    suggested: readonly string[];
    value: string;
    onChange: (id: string) => void;
    /** The chosen colourway's id; empty for the template's first. */
    styleId: string;
    onStyleChange: (id: string) => void;
    /** The business's modules; null when they could not be read. */
    modules: ModuleStates | null;
    disabled?: boolean;
}) {
    const id = useId();
    const narrowed =
        suggested.length > 0 && suggested.length < templates.length;
    // Start on "All" when the one asked for (`?template=`) isn't suggested.
    const [show, setShow] = useState<"suggested" | "all">(() =>
        narrowed && suggested.includes(value) ? "suggested" : "all",
    );
    // Suggested, plus the one chosen under All: a choice is never hidden.
    const shown =
        show === "suggested" && narrowed
            ? templates
                  .filter((t) => suggested.includes(t.id) || t.id === value)
                  .sort((a, b) => rank(suggested, a.id) - rank(suggested, b.id))
            : templates;
    const chosen = templates.find((t) => t.id === value);
    const colourways = chosen?.colourways ?? [];

    return (
        <div className="grid min-w-0 gap-3">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <span id={`${id}-label`} className="text-sm font-medium">
                    Template
                </span>
                {narrowed ? (
                    <div
                        role="group"
                        aria-label="Templates shown"
                        className="inline-flex rounded-md border border-border p-0.5"
                    >
                        {(
                            [
                                ["suggested", "Suggested"],
                                ["all", `All ${templates.length}`],
                            ] as const
                        ).map(([key, label]) => (
                            <button
                                key={key}
                                type="button"
                                aria-pressed={show === key}
                                onClick={() => setShow(key)}
                                className={cn(
                                    "cursor-pointer rounded-sm px-2.5 py-1 text-xs font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11",
                                    show === key
                                        ? "bg-foreground text-background"
                                        : "text-muted-foreground hover:bg-muted active:bg-accent-active",
                                )}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                ) : null}
            </div>
            <RadioGroupPrimitive.Root
                aria-labelledby={`${id}-label`}
                value={value}
                onValueChange={(next) => {
                    onChange(next);
                    // A new template starts in its own first colourway.
                    onStyleChange("");
                }}
                disabled={disabled}
                className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2"
            >
                {shown.map((t) => (
                    <TemplateCard
                        key={t.id}
                        template={t}
                        selected={t.id === value}
                        note={moduleNote(t, modules)}
                    />
                ))}
            </RadioGroupPrimitive.Root>
            {chosen && colourways.length > 1 ? (
                <ColourwayChoice
                    template={chosen}
                    colourways={colourways}
                    value={styleId || colourways[0].id}
                    onChange={onStyleChange}
                    disabled={disabled}
                />
            ) : null}
            <p className="text-xs text-muted-foreground">
                Every page it starts with can be changed or removed.
            </p>
        </div>
    );
}

/** A suggested template's place; the chosen one, if not suggested, last. */
function rank(suggested: readonly string[], id: string): number {
    const i = suggested.indexOf(id);
    return i === -1 ? suggested.length : i;
}

function TemplateCard({
    template,
    selected,
    note,
}: {
    template: Template;
    selected: boolean;
    note: string | null;
}) {
    const id = useId();
    const uses = usesLine(template);
    const shape = shapeWord(template);
    const described = [
        template.description ? `${id}-desc` : null,
        uses ? `${id}-uses` : null,
        note ? `${id}-note` : null,
    ]
        .filter(Boolean)
        .join(" ");
    return (
        <label
            htmlFor={`${id}-radio`}
            className={cn(
                "flex min-w-0 cursor-pointer flex-col overflow-hidden rounded-lg border bg-card text-left transition-colors duration-fast",
                "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2",
                selected
                    ? "border-foreground ring-1 ring-foreground"
                    : "border-border hover:border-foreground/40",
            )}
        >
            <TemplateThumbnail
                name={template.name}
                colourway={template.colourways?.[0]}
            />
            <span className="flex min-w-0 flex-col gap-1.5 p-3">
                <span className="flex min-w-0 items-center gap-2">
                    <RadioGroupPrimitive.Item
                        id={`${id}-radio`}
                        value={template.id}
                        aria-labelledby={`${id}-name`}
                        aria-describedby={described || undefined}
                        className="flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full border border-primary text-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <RadioGroupPrimitive.Indicator className="size-2 rounded-full bg-current" />
                    </RadioGroupPrimitive.Item>
                    <span
                        id={`${id}-name`}
                        className="min-w-0 truncate text-sm font-medium"
                    >
                        {template.name}
                    </span>
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
                {note ? (
                    <span
                        id={`${id}-note`}
                        className="flex items-start gap-1.5 text-xs leading-normal text-muted-foreground"
                    >
                        <Info
                            aria-hidden
                            className="mt-0.5 size-3.5 shrink-0"
                        />
                        {note}
                    </span>
                ) : null}
            </span>
        </label>
    );
}

/**
 * The card's picture. Until the 2× renders land (plan U14), the template's
 * first colourway drawn as a page: its ground, its name in its text colour
 * and a bar of its accent. A template with no colourway is drawn in the
 * workspace's own muted surface rather than an invented palette.
 */
export function TemplateThumbnail({
    name,
    colourway,
}: {
    name: string;
    colourway?: TemplateColourway;
}) {
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

function ColourwayChoice({
    template,
    colourways,
    value,
    onChange,
    disabled,
}: {
    template: Template;
    colourways: readonly TemplateColourway[];
    value: string;
    onChange: (id: string) => void;
    disabled: boolean;
}) {
    const id = useId();
    return (
        <div className="grid min-w-0 gap-2">
            <span id={`${id}-label`} className="text-sm font-medium">
                {template.name} colourway
            </span>
            <RadioGroupPrimitive.Root
                aria-labelledby={`${id}-label`}
                value={value}
                onValueChange={onChange}
                disabled={disabled}
                className="flex min-w-0 flex-wrap gap-2"
            >
                {colourways.map((cw) => {
                    const active = cw.id === value;
                    return (
                        <RadioGroupPrimitive.Item
                            key={cw.id}
                            value={cw.id}
                            className={cn(
                                "flex min-h-9 cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm transition-colors duration-fast coarse:min-h-11",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50",
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
                                        className="h-5 w-3.5"
                                        style={{ background: `hsl(${hsl})` }}
                                    />
                                ))}
                            </span>
                            {cw.name}
                            {active ? (
                                <Check aria-hidden className="size-3.5" />
                            ) : null}
                        </RadioGroupPrimitive.Item>
                    );
                })}
            </RadioGroupPrimitive.Root>
        </div>
    );
}
