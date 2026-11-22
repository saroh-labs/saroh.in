"use client";

import type { ComponentKind } from "@saroh/block-contract";
import {
    COMPONENT_LABELS,
    COMPONENT_OPTION_LABELS,
    componentDefaults,
} from "@saroh/block-contract";
import { Button } from "@saroh/ui/button";
import type { Dispatch, SetStateAction } from "react";
import { useEffect, useRef, useState } from "react";

import { colourName } from "@/lib/share-item/share";
import type { SiteStyle, SiteStyleOptions } from "@/lib/sites/style";
import { activeColourway } from "@/lib/sites/style";
import { resetBody, ResetStyle } from "./brand-sheet-parts";
import { lookName } from "./look-picker";

/** The colour rows in the Brand panel's words (RULES §1), by row key. */
export const ROW_NAMES: Record<string, string> = {
    pageGround: "Page background",
    text: "Text",
    accent: "Accent",
    heroBackground: "Top of the page",
    ctaBand: "Strip",
    footer: "Footer",
};

/** One field of a style, by path: `["look"]`, `["colours", "accent"]`. */
type Leaf = [key: keyof SiteStyle, sub?: string];

/** One change to the look this visit (`WXBBrand`'s "Changes to the look"). */
export interface LookChange {
    id: number;
    /** What changed: "Accent", "Fonts", "Look". */
    part: string;
    /** "Clay to Rose". */
    words: string;
    at: number;
    /** Each field it changed, and its value before. */
    before: { leaf: Leaf; value: unknown }[];
}

/** What the Brand panel needs to list this visit's changes and undo one. */
export interface LookChanges {
    list: LookChange[];
    undo: (id: number) => void;
}

const PER_KEY = new Set<keyof SiteStyle>(["colours", "components"]);
const same = (a: unknown, b: unknown) =>
    JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** The fields that differ, colours and components one key at a time. */
export function changedLeaves(a: SiteStyle, b: SiteStyle): Leaf[] {
    const union = (x: object | undefined, y: object | undefined) =>
        Array.from(new Set(Object.keys(x ?? {}).concat(Object.keys(y ?? {}))));
    const leaves: Leaf[] = [];
    for (const key of union(a, b) as (keyof SiteStyle)[]) {
        const x = a[key] as Record<string, unknown> | undefined;
        const y = b[key] as Record<string, unknown> | undefined;
        if (same(x, y)) continue;
        if (PER_KEY.has(key) && x && y) {
            for (const sub of union(x, y)) {
                if (!same(x[sub], y[sub])) leaves.push([key, sub]);
            }
        } else leaves.push([key]);
    }
    return leaves;
}

function valueAt(style: SiteStyle, [key, sub]: Leaf): unknown {
    const v = style[key] as Record<string, unknown> | undefined;
    return sub === undefined ? v : v?.[sub];
}

/** `style` with each field put back to its value before. */
export function putBack(
    style: SiteStyle,
    before: LookChange["before"],
): SiteStyle {
    const next: Record<string, unknown> = { ...style };
    for (const { leaf, value } of before) {
        const [key, sub] = leaf;
        if (sub === undefined) {
            if (value === undefined) delete next[key];
            else next[key] = value;
            continue;
        }
        const obj = {
            ...((next[key] as Record<string, unknown> | undefined) ?? {}),
        };
        if (value === undefined) delete obj[sub];
        else obj[sub] = value;
        next[key] = obj;
    }
    return next as unknown as SiteStyle;
}

/** Which colours a style is in, in words: a colourway, a brand colour, its own. */
function coloursName(style: SiteStyle, options: SiteStyleOptions): string {
    if (style.brandColour) {
        return `your ${colourName(style.brandColour).toLowerCase()}`;
    }
    return activeColourway(style, options.colourways)?.name ?? "your own";
}

/** One line for a change: which part, and from what to what. */
export function describeChange(
    a: SiteStyle,
    b: SiteStyle,
    options: SiteStyleOptions,
    leaves: Leaf[],
): { part: string; words: string } {
    const has = (key: keyof SiteStyle) => leaves.some(([k]) => k === key);
    if (has("look")) {
        return {
            part: "Look",
            words: `${lookName(a.look)} to ${lookName(b.look)}`,
        };
    }
    if (has("brandColour") || has("palette")) {
        const from = coloursName(a, options);
        const to = coloursName(b, options);
        return { part: "Colours", words: `${cap(from)} to ${to}` };
    }
    if (has("fontPair")) {
        const pairs = options.fontPairs ?? [];
        const name = (key: string | undefined) =>
            (pairs.find((p) => p.key === key) ?? pairs.at(0))?.name ?? "";
        return {
            part: "Fonts",
            words: `${name(a.fontPair)} to ${name(b.fontPair)}`,
        };
    }
    const colour = leaves.find(([k]) => k === "colours");
    if (colour?.[1]) {
        const row = colour[1];
        const label = (key: string) =>
            options.rows
                .find((r) => r.key === row)
                ?.swatches.find((s) => s.key === key)?.label ?? key;
        return {
            part: ROW_NAMES[row] ?? row,
            words: `${label(a.colours[row])} to ${label(b.colours[row])}`,
        };
    }
    const component = leaves.find(([k]) => k === "components");
    if (component) {
        const kind = component[1] as ComponentKind | undefined;
        if (!kind) {
            return {
                part: "Buttons and shapes",
                words: `Back to ${lookName(b.look)}’s own`,
            };
        }
        const names = COMPONENT_OPTION_LABELS[kind] as Record<string, string>;
        const defaults = componentDefaults(b.look);
        const opt = (s: SiteStyle) =>
            names[(s.components?.[kind] ?? defaults[kind]) as string];
        return {
            part: "Buttons and shapes",
            words: `${COMPONENT_LABELS[kind]}: ${opt(a)} to ${opt(b)}`,
        };
    }
    return { part: "Look", words: "Spacing put back" };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

let nextId = 1;

/**
 * This visit's changes to the look, newest first, each with an Undo that
 * puts back only the fields it changed (U24b). Lives beside the style in
 * `useEditorStyle`, so it outlasts the Brand tab closing; a reload starts
 * a new visit. A typeface being tried is not a change until it is kept.
 */
export function useLookChanges(
    style: SiteStyle,
    setStyle: Dispatch<SetStateAction<SiteStyle>>,
    options: SiteStyleOptions,
): LookChanges & {
    /** Name the next change ("Reset to Classic") instead of describing it. */
    nameNext: (part: string, words: string) => void;
} {
    const [list, setList] = useState<LookChange[]>([]);
    const prev = useRef(style);
    const named = useRef<{ part: string; words: string } | null>(null);

    useEffect(() => {
        const before = prev.current;
        prev.current = style;
        if (before === style) return;
        const leaves = changedLeaves(before, style);
        const label =
            named.current ?? describeChange(before, style, options, leaves);
        named.current = null;
        if (leaves.length === 0) return;
        setList((now) => [
            {
                id: nextId++,
                ...label,
                at: Date.now(),
                before: leaves.map((leaf) => ({
                    leaf,
                    value: valueAt(before, leaf),
                })),
            },
            ...now,
        ]);
    }, [style, options]);

    return {
        list,
        undo(id) {
            const change = list.find((c) => c.id === id);
            if (!change) return;
            const next = putBack(style, change.before);
            // Undoing is not a change of its own.
            prev.current = next;
            setStyle(next);
            setList((now) => now.filter((c) => c.id !== id));
        },
        nameNext(part, words) {
            named.current = { part, words };
        },
    };
}

/** "Just now", "5 min ago", "2 h ago". */
export function changedWhen(at: number, now = Date.now()): string {
    const min = Math.floor((now - at) / 60_000);
    if (min < 1) return "Just now";
    if (min < 60) return `${min} min ago`;
    return `${Math.floor(min / 60)} h ago`;
}

/**
 * "Changes to the look · This visit, newest first" with an Undo for each,
 * the line that nothing is live until Publish, and Reset to <look>
 * (`WXBBrand`). The desk draws it in the inspector's place while Brand is
 * open; without a host for it, the Brand panel draws it under its groups.
 */
export function LookChangesPanel({
    changes,
    look,
    onReset,
}: {
    changes: LookChanges | undefined;
    look: SiteStyle["look"];
    onReset: () => void;
}) {
    const list = changes?.list ?? [];
    return (
        <section
            aria-labelledby="look-changes-title"
            data-look-changes=""
            className="flex flex-col gap-3"
        >
            <div>
                <h3 id="look-changes-title" className="text-sm font-semibold">
                    Changes to the look
                </h3>
                <p className="text-xs text-muted-foreground">
                    This visit, newest first
                </p>
            </div>
            {list.length > 0 ? (
                <ul className="divide-y rounded-[10px] border bg-card">
                    {list.map((c) => (
                        <li
                            key={c.id}
                            data-look-change={c.part}
                            className="flex items-start gap-2 px-3 py-2.5"
                        >
                            <span className="min-w-0 flex-1 text-[0.8125rem] leading-snug">
                                <b className="block font-semibold">{c.part}</b>
                                {c.words}
                                <span className="block text-xs text-muted-foreground">
                                    {changedWhen(c.at)}
                                </span>
                            </span>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                aria-label={`Undo ${c.part}: ${c.words}`}
                                onClick={() => changes?.undo(c.id)}
                            >
                                Undo
                            </Button>
                        </li>
                    ))}
                </ul>
            ) : null}
            <p className="text-xs leading-relaxed text-muted-foreground">
                Each change is on the page now and waits with your other
                changes. Nothing is live until you publish.
            </p>
            <div className="flex flex-col gap-2 border-t pt-4">
                <ResetStyle onReset={onReset} look={look} wide />
                <p className="text-xs leading-relaxed text-muted-foreground">
                    {resetBody(look)}
                </p>
            </div>
        </section>
    );
}
