"use client";

import type { BlockFamily } from "@saroh/block-contract";
import { BLOCK_META } from "@saroh/block-contract";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import type { LucideIcon } from "lucide-react";
import { LayoutGrid, PanelBottom, PanelTop } from "lucide-react";
import { useState } from "react";

import {
    SECTION_HINTS,
    SECTION_LABELS,
    addableFamilies,
} from "@/components/sites/editor/editor-constants";
import type { SectionType } from "@/lib/sites/service";
import { ListSearch } from "@saroh/ui/list-search";
import { SECTION_ICONS } from "./block-icons";
import { addBlockGroups } from "./block-kinds";

/**
 * The rail's Add block tab (#337): every block the page can take, grouped the
 * way the design groups them, each with the one line that says what it is.
 *
 * - Structure — blocks whose words are written here.
 * - From your business — blocks that read live data, and stay current.
 * - Every page — the header and footer, already on this page, so listed and
 *   disabled WITH the reason rather than left out.
 *
 * Picking a block with more than one look asks which look first, with real
 * previews (#267); one look inserts straight away. A family (Visit us, Plans;
 * KD5) is one card with a button per layout, each inserting its own section
 * type exactly as a block of its own did.
 */
export function AddBlockPanel({
    onPick,
    onBrowse,
    shopOpen = false,
    packsOpen = false,
    search = false,
    query: searched,
}: {
    /** A search over the blocks' names and lines (a phone's sheet, DEC-185). */
    search?: boolean;
    /**
     * Search results only, for a query typed elsewhere (Rail › Add's own
     * search, U46e): no search box, no Browse button, no Every page group.
     */
    query?: string;
    /** A block was chosen. `looks` says whether a look still has to be picked. */
    onPick: (type: SectionType, looks: number) => void;
    /**
     * Open the picker that draws every block with example content in this
     * site's colours — what "+ Add section" showed before the tab (#267).
     */
    onBrowse: () => void;
    /** The shop is open for the business: the Product grid is offered (G12). */
    shopOpen?: boolean;
    /** Class packs is rolled out and on: its block is offered (DEC-057). */
    packsOpen?: boolean;
}) {
    const [own, setQuery] = useState("");
    const results = searched !== undefined;
    const query = searched ?? own;
    const q = query.trim().toLowerCase();
    const families = addableFamilies(shopOpen, packsOpen, q);
    // A family sits in the group of its leading layout.
    const groups = addBlockGroups(families.map((f) => f.layouts[0].type));
    const structure = families.filter((f) =>
        groups.structure.includes(f.layouts[0].type),
    );
    const business = families.filter((f) =>
        groups.business.includes(f.layouts[0].type),
    );

    return (
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-2 pb-4 pt-4">
            {search && !results ? (
                <ListSearch
                    placeholder="Search blocks"
                    onSearch={setQuery}
                    shortcut={false}
                />
            ) : null}
            {results ? null : (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full gap-1.5"
                    onClick={onBrowse}
                >
                    <LayoutGrid aria-hidden className="size-4" />
                    Browse with previews
                </Button>
            )}
            {q !== "" && structure.length + business.length === 0 ? (
                <p className="px-2 text-sm text-muted-foreground">
                    No block matches “{query.trim()}”.
                </p>
            ) : null}
            {structure.length === 0 ? null : (
                <Group label="Structure">
                    {structure.map((f) => (
                        <FamilyEntry key={f.head} family={f} onPick={onPick} />
                    ))}
                </Group>
            )}
            {business.length === 0 ? null : (
                <Group label="From your business">
                    {business.map((f) => (
                        <FamilyEntry key={f.head} family={f} onPick={onPick} />
                    ))}
                </Group>
            )}
            {q === "" ? (
                <Group label="Every page">
                    <Entry
                        icon={PanelTop}
                        label="Header"
                        hint="Already on this page."
                    />
                    <Entry
                        icon={PanelBottom}
                        label="Footer"
                        hint="Already on this page."
                    />
                </Group>
            ) : null}
        </div>
    );
}

export function Group({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <section aria-label={label} className="space-y-1.5">
            <h3 className="label px-2">{label}</h3>
            <ul className="space-y-1.5">{children}</ul>
        </section>
    );
}

/**
 * One catalogue entry. A lone layout is one button, named as the editor
 * names the section ("Visit us · Talk to us" when a search found only it);
 * a family lists its layouts under its name.
 */
export function FamilyEntry({
    family,
    onPick,
}: {
    family: BlockFamily;
    onPick: (type: SectionType, looks: number) => void;
}) {
    const looks = (t: SectionType) => BLOCK_META[t].variants.length;
    if (family.layouts.length === 1) {
        const t = family.layouts[0].type;
        return (
            <Entry
                icon={SECTION_ICONS[t]}
                label={SECTION_LABELS[t]}
                hint={SECTION_HINTS[t]}
                looks={looks(t)}
                onClick={() => onPick(t, looks(t))}
            />
        );
    }
    const Icon = SECTION_ICONS[family.head];
    return (
        <li>
            <section
                aria-label={family.name}
                className="rounded-lg border px-3 py-2.5"
            >
                <span className="flex items-start gap-3">
                    <Icon
                        aria-hidden
                        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    />
                    <span className="min-w-0 flex-1">
                        <span className="block text-[0.8125rem] font-medium">
                            {family.name}
                        </span>
                        <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                            {SECTION_HINTS[family.head]}
                        </span>
                    </span>
                </span>
                <ul className="mt-2 flex flex-wrap gap-1.5 pl-7">
                    {family.layouts.map((l) => (
                        <li key={l.type}>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                aria-label={`Add ${SECTION_LABELS[l.type]}`}
                                onClick={() => onPick(l.type, looks(l.type))}
                            >
                                {l.label}
                            </Button>
                        </li>
                    ))}
                </ul>
            </section>
        </li>
    );
}

/** One block to add. Without `onClick` it is shown disabled, with its hint as the reason. */
export function Entry({
    icon: Icon,
    label,
    hint,
    looks = 1,
    onClick,
}: {
    icon: LucideIcon;
    label: string;
    hint: string;
    /** How many looks the block has; more than one is said, as it was. */
    looks?: number;
    onClick?: () => void;
}) {
    const disabled = onClick === undefined;
    return (
        <li>
            <button
                type="button"
                onClick={onClick}
                disabled={disabled}
                aria-label={disabled ? `${label}. ${hint}` : `Add ${label}`}
                className={cn(
                    "flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    disabled
                        ? "cursor-not-allowed text-muted-foreground"
                        : "hover:border-foreground/30 hover:bg-muted",
                )}
            >
                <Icon
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                />
                <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2 text-[0.8125rem] font-medium">
                        {label}
                        {looks > 1 ? (
                            <span className="shrink-0 text-xs font-normal text-muted-foreground">
                                {looks} looks
                            </span>
                        ) : null}
                    </span>
                    <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                        {hint}
                    </span>
                </span>
            </button>
        </li>
    );
}
