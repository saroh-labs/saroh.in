"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import type { ReactNode } from "react";

import type { SectionKey } from "@/lib/products/editor-sections";

import { useEditor } from "./editor-state";

/** What each section's bar says it will save, when nothing needs a fix. */
const SAVES: Record<SectionKey, string> = {
    basics: "Saves the name, address, price and category.",
    description: "Saves the description and key points.",
    details: "Saves how to use it and what it is made of.",
    madeby: "Saves who makes it, the warranty and the returns rule.",
    photos: "Saves the photos, the videos and their order.",
    visibility: "",
    variants: "Saves every change in this list.",
    stock: "Saves on hand and the warning level.",
};

const SAVE_LABEL: Record<SectionKey, string> = {
    basics: "Save basics",
    description: "Save description",
    details: "Save",
    madeby: "Save",
    photos: "Save media",
    visibility: "Save",
    variants: "Save variants",
    stock: "Save stock",
};

/**
 * One section of the editor, saved on its own. With changes it says so three
 * ways — a chip by its title, its border, and a bar along its foot with its
 * own Discard and Save — so an edit a column away is never mistaken for
 * saved. While creating, nothing saves yet: the optional sections say so.
 */
export function SectionCard({
    k,
    title,
    children,
    className,
    aside,
    bodyClassName,
}: {
    k: SectionKey;
    title: string;
    children: ReactNode;
    className?: string;
    /** At the heading's far end: the Stock section's Track stock switch. */
    aside?: ReactNode;
    bodyClassName?: string;
}) {
    const { mode, mayEdit, states, saving, saveSections, discard } =
        useEditor();
    const state = states[k];
    const creating = mode === "create";
    const dirty = !creating && (state?.dirty ?? false);
    const problem = state?.problem ?? "";
    const chip = creating
        ? k === "basics" || k === "visibility"
            ? null
            : "optional"
        : dirty
          ? problem
              ? "bad"
              : "unsaved"
          : null;
    const busy = saving.includes(k);
    const note = problem || (state?.note ?? SAVES[k]);
    const noteBad = !!problem || !!state?.noteIsError;

    return (
        <section
            aria-labelledby={`sec-${k}`}
            className={cn(
                "scroll-mt-[176px] rounded-[12px] border bg-card max-[760px]:scroll-mt-[230px]",
                dirty
                    ? problem
                        ? "border-destructive"
                        : "border-highlight"
                    : "border-border",
                className,
            )}
        >
            <div className="flex items-center gap-2.5 px-[18px] pt-[15px]">
                <h2
                    id={`sec-${k}`}
                    // The jumps land on the heading; clear the sticky header.
                    className="scroll-mt-[190px] font-display text-[15px] font-semibold tracking-[-0.015em] max-[760px]:scroll-mt-[250px]"
                >
                    {title}
                </h2>
                {chip ? <SectionChip kind={chip} /> : null}
                {aside ? (
                    <>
                        <span className="flex-1" />
                        {aside}
                    </>
                ) : null}
            </div>
            <div className={cn("px-[18px] pb-[18px] pt-[13px]", bodyClassName)}>
                {children}
            </div>
            {dirty && mayEdit(k) ? (
                <div className="flex flex-wrap items-center gap-[9px] rounded-b-[12px] border-t border-border/70 bg-muted/50 py-2.5 pl-[18px] pr-3.5">
                    <span
                        role="status"
                        className={cn(
                            "min-w-0 flex-[1_1_170px] text-pretty text-[12px] leading-[1.45]",
                            noteBad ? "text-destructive" : "text-foreground/75",
                        )}
                    >
                        {note}
                    </span>
                    <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={() => discard(k)}
                        className="h-[30px] rounded-[8px] px-[11px] text-[12px] font-semibold text-foreground/75"
                    >
                        {state?.discardLabel ?? "Discard"}
                    </Button>
                    <Button
                        type="button"
                        disabled={busy || !!problem}
                        onClick={() => void saveSections([k])}
                        className="h-[30px] rounded-[8px] px-3 text-[12px] font-semibold disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
                    >
                        {busy ? "Saving…" : (state?.saveLabel ?? SAVE_LABEL[k])}
                    </Button>
                </div>
            ) : null}
        </section>
    );
}

export function SectionChip({
    kind,
}: {
    kind: "unsaved" | "bad" | "optional";
}) {
    return (
        <span
            className={cn(
                "shrink-0 rounded-full px-[7px] py-0.5 text-[11px]",
                kind === "optional"
                    ? "border border-dashed border-border-strong font-medium text-muted-foreground"
                    : "font-semibold uppercase tracking-[0.04em]",
                kind === "unsaved" &&
                    "bg-brand-subtle text-brand-subtle-foreground",
                kind === "bad" && "bg-destructive-subtle text-destructive",
            )}
        >
            {kind === "optional"
                ? "Optional"
                : kind === "bad"
                  ? "Needs a fix"
                  : "Unsaved"}
        </span>
    );
}
