"use client";

import { useState } from "react";

import type { GalleryTemplate } from "@/content/templates";
import { cn } from "@/lib/cn";

import { TemplateCard } from "./template-card";

export interface GalleryChip {
    id: string;
    label: string;
}

const CHIP =
    "inline-flex h-9 cursor-pointer items-center rounded-full border px-3.5 text-[14px] transition-[background-color,border-color,color,transform] duration-fast ease-out active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid]";

/**
 * The gallery's kind chips and cards (Templates design). "All" and one chip
 * per kind that has a template; a chip shows the templates made for that
 * kind, and says how many to a screen reader. Every card is in the page as
 * served, so the gallery reads complete without JavaScript.
 */
export function TemplatesGallery({
    templates,
    chips,
    allLabel,
    previewLabel,
}: {
    templates: readonly GalleryTemplate[];
    chips: readonly GalleryChip[];
    allLabel: string;
    previewLabel: string;
}) {
    const [kind, setKind] = useState<string | null>(null);
    const shown = kind
        ? templates.filter((t) => t.kinds.some((k) => k === kind))
        : templates;
    const chipLabel = chips.find((c) => c.id === kind)?.label;
    const options = [{ id: null, label: allLabel }, ...chips];

    return (
        <div className="grid gap-8">
            <div
                role="group"
                aria-label="Kind of business"
                className="flex flex-wrap justify-center gap-2"
            >
                {options.map((chip) => {
                    const on = chip.id === kind;
                    return (
                        <button
                            key={chip.id ?? "all"}
                            type="button"
                            aria-pressed={on}
                            onClick={() => setKind(chip.id)}
                            className={cn(
                                CHIP,
                                on
                                    ? "border-foreground bg-foreground text-background"
                                    : "border-border bg-card text-foreground hover:border-border-strong",
                            )}
                        >
                            {chip.label}
                        </button>
                    );
                })}
            </div>
            <p role="status" className="sr-only">
                {chipLabel
                    ? `${shown.length} ${shown.length === 1 ? "template" : "templates"} for ${chipLabel}`
                    : `${shown.length} templates`}
            </p>
            <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))] gap-6 p-0">
                {shown.map((t) => (
                    <li key={t.slug} className="grid min-w-0">
                        <TemplateCard
                            template={t}
                            previewLabel={previewLabel}
                        />
                    </li>
                ))}
            </ul>
        </div>
    );
}
