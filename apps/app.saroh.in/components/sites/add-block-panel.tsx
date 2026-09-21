"use client";

import { BLOCK_META } from "@saroh/block-contract";
import { cn } from "@saroh/ui/lib/utils";
import type { LucideIcon } from "lucide-react";
import { PanelBottom, PanelTop } from "lucide-react";

import { SECTION_ICONS } from "@/components/sites/block-icons";
import { addBlockGroups } from "@/components/sites/block-kinds";
import {
    SECTION_HINTS,
    SECTION_LABELS,
    SECTION_ORDER,
} from "@/components/sites/editor-constants";
import type { SectionType } from "@/lib/sites/service";

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
 * previews (#267); one look inserts straight away.
 */
export function AddBlockPanel({
    onPick,
}: {
    /** A block was chosen. `looks` says whether a look still has to be picked. */
    onPick: (type: SectionType, looks: number) => void;
}) {
    const { structure, business } = addBlockGroups(SECTION_ORDER);

    return (
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-2 pb-4 pt-4">
            <Group label="Structure">
                {structure.map((t) => (
                    <Entry
                        key={t}
                        icon={SECTION_ICONS[t]}
                        label={SECTION_LABELS[t]}
                        hint={SECTION_HINTS[t]}
                        onClick={() => onPick(t, BLOCK_META[t].variants.length)}
                    />
                ))}
            </Group>
            <Group label="From your business">
                {business.map((t) => (
                    <Entry
                        key={t}
                        icon={SECTION_ICONS[t]}
                        label={SECTION_LABELS[t]}
                        hint={SECTION_HINTS[t]}
                        onClick={() => onPick(t, BLOCK_META[t].variants.length)}
                    />
                ))}
            </Group>
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
        </div>
    );
}

function Group({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <section aria-label={label} className="space-y-1.5">
            <h3 className="px-2 text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                {label}
            </h3>
            <ul className="space-y-1.5">{children}</ul>
        </section>
    );
}

/** One block to add. Without `onClick` it is shown disabled, with its hint as the reason. */
function Entry({
    icon: Icon,
    label,
    hint,
    onClick,
}: {
    icon: LucideIcon;
    label: string;
    hint: string;
    onClick?: () => void;
}) {
    const disabled = onClick === undefined;
    return (
        <li>
            <button
                type="button"
                onClick={onClick}
                disabled={disabled}
                aria-label={disabled ? `${label} — ${hint}` : `Add ${label}`}
                className={cn(
                    "flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    disabled
                        ? "cursor-not-allowed text-muted-foreground"
                        : "hover:border-foreground/30 hover:bg-muted",
                )}
            >
                <Icon
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                />
                <span className="min-w-0">
                    <span className="block text-[0.8125rem] font-medium">
                        {label}
                    </span>
                    <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                        {hint}
                    </span>
                </span>
            </button>
        </li>
    );
}
