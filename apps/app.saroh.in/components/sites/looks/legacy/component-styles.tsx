"use client";

import type { ComponentKind, ComponentStyles } from "@saroh/block-contract";
import {
    COMPONENT_KINDS,
    COMPONENT_LABELS,
    COMPONENT_OPTION_LABELS,
    COMPONENT_STYLE_OPTIONS,
    componentDefaults,
} from "@saroh/block-contract";
import { Button } from "@saroh/ui/button";
import { ChipGroup } from "@saroh/ui/choice-group";
import { cn } from "@saroh/ui/lib/utils";
import { ChevronRight } from "lucide-react";
import { useId, useState } from "react";

import type { SiteStyle } from "@/lib/sites/style";
import { changedComponents, withComponents } from "@/lib/sites/style";
import { BrandPicker, PickerHeader } from "../brand-picker";
import { lookName } from "./look-picker";

/** "Folio’s defaults, 2 changed · Free on every plan" (SBCustomise). */
export function componentsLine(style: SiteStyle): string {
    const n = changedComponents(style).length;
    return `${lookName(style.look)}’s defaults${n > 0 ? `, ${n} changed` : ""} · Free on every plan`;
}

/**
 * The Brand tab's "Customise components" (DEC-227, plan U2): a row that
 * opens the list beside the rail on a desk; in a phone's Brand sheet the
 * list itself (`BrandPicker`). Free on every plan, so nothing here asks
 * the plan.
 */
export function ComponentStylesRow({
    style,
    onChange,
}: {
    style: SiteStyle;
    onChange: (next: SiteStyle) => void;
}) {
    const [open, setOpen] = useState(false);
    const line = componentsLine(style);
    return (
        <section className="space-y-1" data-component-styles="">
            <BrandPicker
                open={open}
                onOpenChange={setOpen}
                title="Customise components"
                className="w-[360px] max-w-[calc(100vw-24px)]"
                header={
                    <PickerHeader
                        title="Customise components"
                        onClose={() => setOpen(false)}
                    />
                }
                trigger={
                    <button
                        type="button"
                        aria-haspopup="dialog"
                        aria-expanded={open}
                        data-components-open=""
                        className={cn(
                            "flex min-h-11 w-full items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5 text-left transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            open && "border-foreground ring-1 ring-foreground",
                        )}
                    >
                        <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold">
                                Customise components
                            </span>
                            <span className="block text-xs text-muted-foreground">
                                {line}
                            </span>
                        </span>
                        <ChevronRight
                            aria-hidden
                            className="size-4 shrink-0 text-muted-foreground"
                        />
                    </button>
                }
            >
                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                    <ComponentStyleList style={style} onChange={onChange} />
                </div>
            </BrandPicker>
        </section>
    );
}

/**
 * Each component and its options as a labelled radio group, the look's
 * default chosen until the owner picks. A pick is kept even when it equals
 * the look's default (KD1); a row that differs says "Changed from <look>"
 * with Undo, and "Reset to <look>" takes every choice away. `disabled`
 * draws them for a Reviewer (DEC-200): seen, not changed.
 */
export function ComponentStyleList({
    style,
    onChange,
    disabled = false,
}: {
    style: SiteStyle;
    onChange: (next: SiteStyle) => void;
    disabled?: boolean;
}) {
    const look = lookName(style.look);
    const defaults = componentDefaults(style.look);
    const chosen: ComponentStyles = style.components ?? {};
    const changed = new Set(changedComponents(style));
    const set = (next: ComponentStyles) =>
        onChange(withComponents(style, next));
    return (
        <div className="space-y-3" data-component-list="">
            <p className="text-xs text-muted-foreground">
                {componentsLine(style)}
            </p>
            {COMPONENT_KINDS.map((kind) => (
                <ComponentRow
                    key={kind}
                    kind={kind}
                    value={chosen[kind] ?? defaults[kind]}
                    changedFrom={changed.has(kind) ? look : null}
                    disabled={disabled}
                    onChoose={(value) => set({ ...chosen, [kind]: value })}
                    onUndo={() => {
                        const { [kind]: _undone, ...rest } = chosen;
                        set(rest);
                    }}
                />
            ))}
            {style.components && !disabled ? (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-components-reset=""
                    onClick={() => set({})}
                >
                    Reset to {look}
                </Button>
            ) : null}
        </div>
    );
}

function ComponentRow({
    kind,
    value,
    changedFrom,
    disabled,
    onChoose,
    onUndo,
}: {
    kind: ComponentKind;
    value: string;
    /** The look it was changed from; null when it is the look's own. */
    changedFrom: string | null;
    disabled: boolean;
    onChoose: (value: string) => void;
    onUndo: () => void;
}) {
    const labelId = useId();
    const label = COMPONENT_LABELS[kind];
    const names = COMPONENT_OPTION_LABELS[kind] as Record<string, string>;
    const options = COMPONENT_STYLE_OPTIONS[kind] as readonly string[];
    return (
        <div className="space-y-1.5" data-component-row={kind}>
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                <span id={labelId} className="text-sm font-medium">
                    {label}
                </span>
                {changedFrom ? (
                    <span
                        className="flex flex-1 items-baseline justify-between gap-2 text-xs text-muted-foreground"
                        data-component-changed=""
                    >
                        Changed from {changedFrom}
                        {disabled ? null : (
                            <Button
                                type="button"
                                variant="link"
                                size="inline"
                                aria-label={`Undo ${label}`}
                                onClick={onUndo}
                            >
                                Undo
                            </Button>
                        )}
                    </span>
                ) : null}
            </div>
            <ChipGroup
                labelledBy={labelId}
                value={value}
                disabled={disabled}
                onChange={onChoose}
                choices={options.map((option) => ({
                    value: option,
                    label: names[option],
                    data: { "data-component-option": option },
                }))}
            />
            {kind === "images" ? (
                <p className="text-xs text-muted-foreground">
                    Soft keeps your look’s own corner. Round: people and
                    products only.
                </p>
            ) : null}
        </div>
    );
}
