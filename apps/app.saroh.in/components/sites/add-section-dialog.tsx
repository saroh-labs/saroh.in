"use client";

import { useState } from "react";

import type { SectionType } from "@saroh/block-contract";
import { BLOCK_META } from "@saroh/block-contract";
import { BlockFixturePreview } from "@saroh/site-blocks";
import { Button } from "@saroh/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@saroh/ui/dialog";

import { BlockThumbnail } from "./block-thumbnail";
import {
    SECTION_HINTS,
    SECTION_LABELS,
    SECTION_ORDER,
} from "./editor-constants";

/**
 * "Add section", showing what you are about to get (#267).
 *
 * Two steps. First the block, each drawn by its real component against its
 * catalog example, in THIS merchant's palette. Then, for a block with more
 * than one look, the look. A block with one look inserts straight away.
 *
 * The picker only SETS the look. It is `content.variant` like any other, and
 * the section editor's Look field changes it afterwards (#254), so the two can
 * never disagree about what the block is.
 */
export function AddSectionDialog({
    open,
    onOpenChange,
    variables,
    onAdd,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** This merchant's `--site-*` variables, so previews wear their palette. */
    variables?: Record<string, string>;
    /** Insert a section of `type`; `variant` is set when a look was chosen. */
    onAdd: (type: SectionType, variant?: string) => void;
}) {
    const [type, setType] = useState<SectionType | null>(null);

    const close = (next: boolean) => {
        if (!next) setType(null);
        onOpenChange(next);
    };
    const add = (t: SectionType, variant?: string) => {
        onAdd(t, variant);
        close(false);
    };

    const meta = type ? BLOCK_META[type] : null;

    return (
        <Dialog open={open} onOpenChange={close}>
            <DialogContent className="max-h-[90dvh] max-w-5xl overflow-y-auto">
                {meta && type ? (
                    <>
                        <DialogHeader>
                            <DialogTitle>
                                Choose a look for {SECTION_LABELS[type]}
                            </DialogTitle>
                            <DialogDescription>
                                You can change the look later from the section
                                settings.
                            </DialogDescription>
                        </DialogHeader>
                        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {meta.variants.map((v) => (
                                <li key={v.id}>
                                    <PickerCard
                                        label={v.label}
                                        description={v.description}
                                        onPick={() => add(type, v.id)}
                                    >
                                        <BlockThumbnail variables={variables}>
                                            <BlockFixturePreview
                                                type={type}
                                                variant={v.id}
                                            />
                                        </BlockThumbnail>
                                    </PickerCard>
                                </li>
                            ))}
                        </ul>
                        <div>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setType(null)}
                            >
                                Back to all sections
                            </Button>
                        </div>
                    </>
                ) : (
                    <>
                        <DialogHeader>
                            <DialogTitle>Add a section</DialogTitle>
                            <DialogDescription>
                                Each is shown with example content in your
                                site&apos;s colours.
                            </DialogDescription>
                        </DialogHeader>
                        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {SECTION_ORDER.map((t) => {
                                const m = BLOCK_META[t];
                                const looks = m.variants.length;
                                return (
                                    <li key={t}>
                                        <PickerCard
                                            label={SECTION_LABELS[t]}
                                            description={SECTION_HINTS[t]}
                                            detail={
                                                looks > 1
                                                    ? `${looks} looks`
                                                    : undefined
                                            }
                                            onPick={() =>
                                                looks > 1 ? setType(t) : add(t)
                                            }
                                        >
                                            <BlockThumbnail
                                                variables={variables}
                                            >
                                                <BlockFixturePreview
                                                    type={t}
                                                    variant={m.variants[0].id}
                                                />
                                            </BlockThumbnail>
                                        </PickerCard>
                                    </li>
                                );
                            })}
                        </ul>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}

function PickerCard({
    label,
    description,
    detail,
    onPick,
    children,
}: {
    label: string;
    description: string;
    detail?: string;
    onPick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onPick}
            className="grid w-full gap-2 rounded-lg border p-2 text-left transition-colors hover:border-foreground/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
            {children}
            <span className="grid gap-0.5 px-1 pb-1">
                <span className="flex items-baseline justify-between gap-2 text-sm font-medium">
                    {label}
                    {detail ? (
                        <span className="text-sm font-normal text-muted-foreground">
                            {detail}
                        </span>
                    ) : null}
                </span>
                <span className="text-sm text-muted-foreground">
                    {description}
                </span>
            </span>
        </button>
    );
}
