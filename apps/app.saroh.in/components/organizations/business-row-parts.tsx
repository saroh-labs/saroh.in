"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { Lock } from "lucide-react";
import type { ReactNode } from "react";

import { Absent, Section } from "@/components/sites/settings-rows";
import type { BusinessSheet } from "@/lib/organizations/business-rows";
import { businessEditId } from "@/lib/organizations/business-rows";

import type { BusinessSheets } from "./use-business-sheets";

/**
 * The small pieces Settings › Business's rows share: a row's one action,
 * the reason a locked fact can't be changed, the "Coming soon" pill and a
 * tab's card of rows with its note.
 */

/**
 * A row's Edit, which opens its sheet. `name` says what it edits to a
 * screen reader; `id` only where a sheet has more than one row.
 */
export function EditRow({
    sheet,
    sheets,
    label = "Edit",
    name,
    id = businessEditId(sheet),
}: {
    sheet: BusinessSheet;
    sheets: BusinessSheets;
    label?: string;
    name?: string;
    id?: string;
}) {
    return (
        <Button
            id={id}
            type="button"
            size="sm"
            variant="outline"
            aria-haspopup="dialog"
            aria-label={name}
            onClick={() => sheets.open(sheet, id)}
        >
            {label}
        </Button>
    );
}

/**
 * A tab's row actions: `edit` is a row's one action (none for a role that
 * can't change settings), and `editOrAdd` says "Edit" for a value that is
 * set and the words to add one otherwise.
 */
export function rowActions(canEdit: boolean, sheets: BusinessSheets) {
    const edit = (sheet: BusinessSheet, label: string, name?: string) =>
        canEdit ? (
            <EditRow sheet={sheet} sheets={sheets} label={label} name={name} />
        ) : null;
    const editOrAdd = (
        sheet: BusinessSheet,
        set: boolean,
        what: string,
        add: string,
    ) => (set ? edit(sheet, "Edit", `Edit ${what}`) : edit(sheet, add));
    return { edit, editOrAdd };
}

/**
 * The saved value, or what stands in for a missing one. Mono is for the
 * measured value only; the words that stand in for one are prose.
 */
export function Saved({
    text,
    empty = "Not set",
    mono = false,
}: {
    text: string;
    empty?: string;
    mono?: boolean;
}) {
    return text !== "" ? (
        <span
            className={
                mono
                    ? "block font-mono [overflow-wrap:anywhere]"
                    : "block [overflow-wrap:anywhere]"
            }
        >
            {text}
        </span>
    ) : (
        <Absent>{empty}</Absent>
    );
}

/** A locked fact's reason, e.g. "From your first order". */
export function Locked({ children }: { children: ReactNode }) {
    return (
        <Badge variant="neutral" className="gap-1">
            <Lock aria-hidden className="size-3" />
            {children}
        </Badge>
    );
}

/**
 * The "Coming soon" pill ("Saroh Settings" design): something the screen
 * shows that Saroh doesn't keep yet, said rather than pretended.
 */
export function ComingSoon() {
    return (
        <Badge
            variant="draft"
            className="flex-none px-[7px] py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em]"
        >
            Coming soon
        </Badge>
    );
}

/** A second, quieter line under a row's value. */
export function Follows({ children }: { children: ReactNode }) {
    return (
        <span className="block text-pretty text-[12.5px] text-muted-foreground">
            {children}
        </span>
    );
}

/**
 * One tab's rows: the card, what it holds in a line, a notice above the
 * rows (why they read as they do) and a note under them.
 */
export function BusinessRows({
    title,
    lead,
    notice,
    note,
    children,
}: {
    /** Names the card for a screen reader; the tab says it on screen. */
    title: string;
    lead: string;
    notice?: ReactNode;
    note?: ReactNode;
    children: ReactNode;
}) {
    return (
        <section aria-label={title} className="grid min-w-0 gap-2">
            <p className="text-sm text-muted-foreground">{lead}</p>
            {notice ? (
                <p className="text-pretty rounded-lg bg-muted px-3 py-2.5 text-[12.5px] leading-normal">
                    {notice}
                </p>
            ) : null}
            <Section>{children}</Section>
            {note ? (
                <p className="text-pretty text-[12px] leading-normal text-muted-foreground">
                    {note}
                </p>
            ) : null}
        </section>
    );
}
