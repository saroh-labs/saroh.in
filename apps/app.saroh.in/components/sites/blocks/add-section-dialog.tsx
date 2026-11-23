"use client";

import { useState } from "react";

import type { LookId, SectionType } from "@saroh/block-contract";
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
import { Sparkles } from "lucide-react";

import {
    SECTION_HINTS,
    SECTION_LABELS,
    addableFamilies,
} from "@/components/sites/editor/editor-constants";
import { BlockThumbnail } from "./block-thumbnail";

/** The library's categories (A2, `fix/WXKLibrary`), in the board's order. */
const CATEGORY_OF: Record<SectionType, string> = {
    hero: "Top and about",
    richText: "Top and about",
    cta: "Top and about",
    gallery: "Top and about",
    features: "Top and about",
    person: "Top and about",
    projects: "Top and about",
    servicesList: "Services and shop",
    productGrid: "Services and shop",
    plans: "Services and shop",
    packs: "Services and shop",
    booking: "Bookings",
    timetable: "Bookings",
    testimonials: "Reviews",
    faq: "Reviews",
    enquiry: "Contact and posts",
    contact: "Contact and posts",
    visitUs: "Contact and posts",
    hours: "Contact and posts",
    journal: "Contact and posts",
};
const CATEGORY_ORDER = [
    "Top and about",
    "Services and shop",
    "Bookings",
    "Reviews",
    "Contact and posts",
];

/** Families under their categories, each category with what it holds. */
/** Where a business-filled block's words come from (A2, `WXKLibrary`). */
const SOURCE_OF: Partial<Record<SectionType, string>> = {
    servicesList: "From Services",
    productGrid: "From Products",
    plans: "From Plans",
    packs: "From Class packs",
    booking: "From Bookings",
    timetable: "From Classes",
    enquiry: "From Forms",
    journal: "From your posts",
    visitUs: "From your business details",
    hours: "From your opening hours",
    contact: "From your business details",
};

export function libraryCategories<F extends { head: SectionType }>(
    families: readonly F[],
): { name: string; families: F[] }[] {
    return CATEGORY_ORDER.map((name) => ({
        name,
        families: families.filter((f) => CATEGORY_OF[f.head] === name),
    })).filter((c) => c.families.length > 0);
}

/**
 * "Add section", showing what you are about to get (#267).
 *
 * Two steps. First the block, each drawn by its real component against its
 * catalog example, in THIS merchant's palette. Then, for a block with more
 * than one look, the look. A block with one look inserts straight away.
 *
 * A family (Visit us, Plans; KD5) is one card; opening it shows each
 * layout's looks, and a layout inserts its own section type as before.
 *
 * The picker only SETS the look. It is `content.variant` like any other, and
 * the section editor's Look field changes it afterwards (#254), so the two can
 * never disagree about what the block is.
 */
/** A group's id in the library, for its rail link. */
const categoryId = (name: string) =>
    `library-${name.toLowerCase().replace(/[^a-z]+/g, "-")}`;

export function AddSectionDialog({
    open,
    onOpenChange,
    variables,
    look,
    onAdd,
    startType = null,
    shopOpen = false,
    packsOpen = false,
    onDescribe,
}: {
    /**
     * "Not here? Describe a section": Ask AI on the page (A2). Absent where
     * Ask AI is not on for this person.
     */
    onDescribe?: () => void;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** This merchant's `--site-*` variables, so previews wear their palette. */
    variables?: Record<string, string>;
    /** The draft's look (DEC-172, U16), so previews wear it; absent Classic. */
    look?: LookId;
    /** Insert a section of `type`; `variant` is set when a look was chosen. */
    onAdd: (type: SectionType, variant?: string) => void;
    /**
     * Open straight on this block's looks — the Add block tab has already
     * chosen the block (#337). "Back" then closes rather than showing every
     * block again, because the list of blocks is the tab.
     */
    startType?: SectionType | null;
    /** The shop is open for the business: the Product grid is offered (G12). */
    shopOpen?: boolean;
    /** Class packs is rolled out and on: its block is offered (DEC-057). */
    packsOpen?: boolean;
}) {
    /** The layouts being chosen from: a family's, or the one block's. */
    const [picked, setType] = useState<SectionType[] | null>(null);
    const types = picked ?? (startType ? [startType] : null);

    const close = (next: boolean) => {
        if (!next) setType(null);
        onOpenChange(next);
    };
    const add = (t: SectionType, variant?: string) => {
        onAdd(t, variant);
        close(false);
    };

    const categories = libraryCategories(addableFamilies(shopOpen, packsOpen));

    const title =
        types && types.length > 1
            ? BLOCK_META[types[0]].label
            : types
              ? SECTION_LABELS[types[0]]
              : "";

    return (
        <Dialog open={open} onOpenChange={close}>
            <DialogContent className="max-h-[90dvh] max-w-5xl overflow-y-auto">
                {types ? (
                    <>
                        <DialogHeader>
                            <DialogTitle>Choose a look for {title}</DialogTitle>
                            <DialogDescription>
                                You can change the look later from the section
                                settings.
                            </DialogDescription>
                        </DialogHeader>
                        {types.map((type) => {
                            const variants = BLOCK_META[type].variants;
                            return (
                                <section
                                    key={type}
                                    aria-label={SECTION_LABELS[type]}
                                    className="grid gap-2"
                                >
                                    {types.length > 1 ? (
                                        <h3 className="text-sm font-medium">
                                            {SECTION_LABELS[type]}
                                        </h3>
                                    ) : null}
                                    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                        {variants.map((v) => (
                                            <li key={v.id}>
                                                <PickerCard
                                                    label={v.label}
                                                    description={v.description}
                                                    // One look inserts as it always did, with no variant.
                                                    onPick={() =>
                                                        variants.length > 1
                                                            ? add(type, v.id)
                                                            : add(type)
                                                    }
                                                >
                                                    <BlockThumbnail
                                                        variables={variables}
                                                        look={look}
                                                    >
                                                        <BlockFixturePreview
                                                            type={type}
                                                            variant={v.id}
                                                            look={look}
                                                        />
                                                    </BlockThumbnail>
                                                </PickerCard>
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                            );
                        })}
                        <div>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() =>
                                    startType ? close(false) : setType(null)
                                }
                            >
                                {startType ? "Back" : "Back to all sections"}
                            </Button>
                        </div>
                    </>
                ) : (
                    <>
                        <DialogHeader>
                            <DialogTitle>New section</DialogTitle>
                            <DialogDescription>
                                Each is shown with example content in your
                                site&apos;s colours.
                            </DialogDescription>
                        </DialogHeader>
                        {/* A rail of the groups with their counts beside
                            the cards (A2, `WXKLibrary`). */}
                        <div className="grid gap-6 md:grid-cols-[11rem_minmax(0,1fr)]">
                            <nav
                                aria-label="Kinds of section"
                                className="sticky top-0 hidden self-start md:block"
                            >
                                <ul className="grid gap-0.5">
                                    {categories.map(({ name, families }) => (
                                        <li key={name}>
                                            <Button
                                                data-ph-unmask=""
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="w-full justify-between gap-2 font-normal"
                                                onClick={() =>
                                                    document
                                                        .getElementById(
                                                            categoryId(name),
                                                        )
                                                        ?.scrollIntoView({
                                                            block: "start",
                                                            behavior: "smooth",
                                                        })
                                                }
                                            >
                                                <span className="truncate">
                                                    {name}
                                                </span>
                                                <span className="tabular-nums text-muted-foreground">
                                                    {families.length}
                                                </span>
                                            </Button>
                                        </li>
                                    ))}
                                </ul>
                            </nav>
                            <div className="grid min-w-0 gap-6">
                                {categories.map(({ name, families }) => (
                                    <section
                                        key={name}
                                        id={categoryId(name)}
                                        aria-label={name}
                                        className="grid scroll-mt-2 gap-2"
                                        data-library-category={name}
                                    >
                                        <h3 className="flex items-baseline gap-1.5 text-sm font-medium">
                                            {name}
                                            <span className="font-normal tabular-nums text-muted-foreground">
                                                {families.length}
                                            </span>
                                        </h3>
                                        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                            {families.map((f) => {
                                                const t = f.layouts[0].type;
                                                const m = BLOCK_META[t];
                                                const looks = m.variants.length;
                                                const layouts =
                                                    f.layouts.length;
                                                return (
                                                    <li key={f.head}>
                                                        <PickerCard
                                                            label={
                                                                layouts > 1
                                                                    ? f.name
                                                                    : SECTION_LABELS[
                                                                          t
                                                                      ]
                                                            }
                                                            // Where its words come
                                                            // from, else what it is (A2).
                                                            description={
                                                                SOURCE_OF[t] ??
                                                                SECTION_HINTS[t]
                                                            }
                                                            // Name and source only; a
                                                            // look is chosen after (A2 · 3).
                                                            detail={
                                                                layouts > 1
                                                                    ? `${layouts} layouts`
                                                                    : undefined
                                                            }
                                                            onPick={() =>
                                                                layouts > 1 ||
                                                                looks > 1
                                                                    ? setType(
                                                                          f.layouts.map(
                                                                              (
                                                                                  l,
                                                                              ) =>
                                                                                  l.type,
                                                                          ),
                                                                      )
                                                                    : add(t)
                                                            }
                                                        >
                                                            <BlockThumbnail
                                                                variables={
                                                                    variables
                                                                }
                                                                look={look}
                                                            >
                                                                <BlockFixturePreview
                                                                    type={t}
                                                                    variant={
                                                                        m
                                                                            .variants[0]
                                                                            .id
                                                                    }
                                                                    look={look}
                                                                />
                                                            </BlockThumbnail>
                                                        </PickerCard>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </section>
                                ))}
                                {onDescribe ? (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        data-describe-section=""
                                        className="h-auto justify-start gap-3 whitespace-normal border-dashed p-4 text-left"
                                        onClick={() => {
                                            close(false);
                                            onDescribe();
                                        }}
                                    >
                                        <Sparkles
                                            aria-hidden
                                            className="size-5 shrink-0"
                                        />
                                        <span className="grid gap-0.5">
                                            <span className="font-semibold">
                                                Not here? Describe a section
                                            </span>
                                            <span className="text-sm font-normal text-muted-foreground">
                                                Ask AI makes it from your words
                                            </span>
                                        </span>
                                    </Button>
                                ) : null}
                            </div>
                        </div>
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
            className="grid w-full gap-2 rounded-lg border p-2 text-left transition-colors duration-fast hover:border-foreground/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
