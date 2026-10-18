"use client";

import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { showError, showUndo } from "@saroh/ui/toast";
import { GripVertical, X } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactElement } from "react";
import { useId, useRef, useState } from "react";

import { FormSheet } from "@/components/shared/form-sheet";
import { count } from "@/lib/format/plural";
import type { CatalogueView } from "@/lib/products/settings";
import {
    addOption,
    addOptionValue,
    removeOption,
    removeOptionValue,
    renameOption,
    renameOptionValue,
    reorderOptionValues,
} from "@/lib/products/settings-actions";

import { PROBLEM } from "./product-settings";

type Option = CatalogueView["options"][number];
const MAX = 40;
const same = (a: string, b: string) =>
    a.trim().toLowerCase() === b.trim().toLowerCase();

/** The one-option rule, said where an option is made (and on the tab). */
export const ONE_OPTION_RULE =
    "How customers choose a variant: Shade, Size, Edition. A product picks one of these. For size and colour together, make values like “A5 · Ruled”.";

/** A value in the sheet's draft: a saved one (`id`) or one typed here. */
interface Row {
    key: string;
    id?: string;
    value: string;
    variantCount: number;
}

const rowsOf = (o?: Option): Row[] =>
    (o?.values ?? []).map((v) => ({
        key: v.id,
        id: v.id,
        value: v.value,
        variantCount: v.variantCount,
    }));

/** "A to Z", reading "250 g" before "1 L" by its number. */
const byName = (a: Row, b: Row) =>
    a.value.localeCompare(b.value, undefined, {
        numeric: true,
        sensitivity: "base",
    });

/** Why the draft's values can't be saved, or "". */
export function valuesProblem(values: string[]): string {
    const blank = values.findIndex((v) => !v.trim());
    if (blank > -1) return "A value can't be empty. Type one, or take it off.";
    const long = values.find((v) => v.trim().length > MAX);
    if (long) return `Keep a value under ${MAX} characters.`;
    const twin = values.find((v, i) =>
        values.some((w, j) => j < i && same(v, w)),
    );
    return twin ? `${twin.trim()} is there twice.` : "";
}

/**
 * A new option, or one being edited: its name and its values, managed
 * together and saved with one button. In the draft a value can be renamed
 * where it stands (it changes on every variant that uses it), moved by
 * dragging its handle or with the arrow keys on it, sorted A to Z, added,
 * and taken off when no variant uses it. Nothing reaches the catalogue
 * until Save, and Cancel drops the lot. Problems are said when Save is
 * pressed, as every sheet does.
 *
 * Saving an edit is several small calls (the name, values off, renames,
 * values on, the order). If one is refused the sheet stays open with the
 * draft, and Save again sends only what is still to do; Undo sends them
 * back in reverse.
 */
export function OptionSheet({
    trigger,
    option,
    options,
}: {
    trigger: ReactElement;
    /** The option to edit; none makes a new one. */
    option?: Option;
    /** Every option, for "already exists". */
    options: Option[];
}) {
    const router = useRouter();
    const id = useId();
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [tried, setTried] = useState(false);
    const [name, setName] = useState(option?.name ?? "");
    const [rows, setRows] = useState<Row[]>(() => rowsOf(option));
    // Saved values taken off in this draft.
    const [removed, setRemoved] = useState<Row[]>([]);
    const [value, setValue] = useState("");
    const [valueErr, setValueErr] = useState("");
    const made = useRef(0);
    const dragged = useRef<string | null>(null);

    const nd = name.trim();
    const twin = options.find((o) => o.id !== option?.id && same(o.name, nd));
    const problem = !nd
        ? "An option needs a name."
        : twin
          ? `${twin.name} already exists.`
          : nd.length > MAX
            ? `Keep it under ${MAX} characters.`
            : "";
    const error = tried ? problem : "";
    const listProblem = tried ? valuesProblem(rows.map((r) => r.value)) : "";

    function reset() {
        setTried(false);
        setName(option?.name ?? "");
        setRows(rowsOf(option));
        setRemoved([]);
        setValue("");
        setValueErr("");
    }

    /**
     * Puts what is typed in the value field into the draft. Returns the
     * draft's rows, or null when the typed one can't be added.
     */
    function stageValue(): Row[] | null {
        const v = value.trim();
        if (!v) return rows;
        // One taken off a moment ago comes back rather than being added.
        const back = removed.find((x) => same(x.value, v));
        if (back) {
            const next = [...rows, back];
            setRemoved(removed.filter((x) => x.key !== back.key));
            setRows(next);
            setValue("");
            return next;
        }
        const there = rows.find((x) => same(x.value, v));
        if (there) {
            setValueErr(`${there.value.trim()} is already a value.`);
            return null;
        }
        if (v.length > MAX) {
            setValueErr(`Keep a value under ${MAX} characters.`);
            return null;
        }
        made.current += 1;
        const next = [
            ...rows,
            { key: `new-${made.current}`, value: v, variantCount: 0 },
        ];
        setRows(next);
        setValue("");
        return next;
    }

    function move(key: string, to: number) {
        setRows((rs) => {
            const from = rs.findIndex((r) => r.key === key);
            if (from < 0 || to < 0 || to >= rs.length || from === to) return rs;
            const next = [...rs];
            next.splice(to, 0, ...next.splice(from, 1));
            return next;
        });
    }

    async function create(draft: Row[]) {
        const res = await addOption(
            nd,
            draft.map((r) => r.value.trim()),
        );
        if (!res.ok) return showError(res.error);
        setOpen(false);
        router.refresh();
        showUndo(`${nd} added.`, async () => {
            const back = await removeOption(res.data.id);
            router.refresh();
            return back;
        });
    }

    async function update(o: Option, draft: Row[]) {
        // What Undo sends back, in the order it was done.
        const undo: (() => Promise<{ ok: boolean }>)[] = [];
        const refused = (message: string) => {
            // What did save shows in the list behind the sheet.
            router.refresh();
            showError(message);
        };
        // Read against what is saved now, so Save after a refusal sends
        // only what is still to do.
        const server = o.values;
        const renamed = nd !== o.name;
        if (renamed) {
            const res = await renameOption(o.id, nd);
            if (!res.ok) return refused(res.error);
            undo.push(() => renameOption(o.id, o.name));
        }
        for (const r of removed) {
            if (!r.id || !server.some((v) => v.id === r.id)) continue;
            const res = await removeOptionValue(o.id, r.id);
            if (!res.ok) return refused(res.error);
            undo.push(() => addOptionValue(o.id, r.value));
        }
        let variantsRenamed = 0;
        for (const r of draft) {
            const now = r.id ? server.find((v) => v.id === r.id) : undefined;
            if (!r.id || !now || now.value === r.value.trim()) continue;
            const res = await renameOptionValue(o.id, r.id, r.value.trim());
            if (!res.ok) return refused(res.error);
            variantsRenamed += res.data.variantCount;
            const rid = r.id;
            undo.push(() => renameOptionValue(o.id, rid, now.value));
        }
        const ids: string[] = [];
        for (const r of draft) {
            if (r.id) {
                ids.push(r.id);
                continue;
            }
            const saved = server.find((v) => same(v.value, r.value));
            if (saved) {
                ids.push(saved.id);
                continue;
            }
            const res = await addOptionValue(o.id, r.value.trim());
            if (!res.ok) return refused(res.error);
            ids.push(res.data.id);
            undo.push(() => removeOptionValue(o.id, res.data.id));
        }
        // The order the server holds now: kept ones as they were, then new.
        const kept = server
            .map((v) => v.id)
            .filter((x) => !removed.some((r) => r.id === x));
        const before = [...kept, ...ids.filter((x) => !kept.includes(x))];
        if (before.join() !== ids.join()) {
            const res = await reorderOptionValues(o.id, ids);
            if (!res.ok) return refused(res.error);
            undo.push(() => reorderOptionValues(o.id, before));
        }
        setOpen(false);
        if (undo.length === 0) return;
        router.refresh();
        showUndo(
            renamed
                ? `${o.name} is now ${nd}. Customers see the new name.`
                : variantsRenamed > 0
                  ? `${nd} saved. Renamed on ${count(variantsRenamed, "variant")}.`
                  : `${nd} saved.`,
            async () => {
                let undone = true;
                for (const step of undo.reverse()) {
                    const back = await step();
                    if (!back.ok) {
                        undone = false;
                        break;
                    }
                }
                router.refresh();
                return undone
                    ? true
                    : {
                          ok: false,
                          error: `Not every change to ${nd} went back. Check its values.`,
                      };
            },
        );
    }

    return (
        <FormSheet
            trigger={trigger}
            open={open}
            onOpen={() => {
                reset();
                setOpen(true);
            }}
            onClose={() => setOpen(false)}
            fieldsClassName="gap-4"
            title={option ? `Edit ${option.name}` : "New option"}
            description={
                option
                    ? "Its name and the values your variants pick from, in the order customers see them."
                    : ONE_OPTION_RULE
            }
            pending={busy}
            saveLabel={option ? "Save" : "Add option"}
            savingLabel={option ? "Saving…" : "Adding…"}
            onSubmit={(e) => {
                e.preventDefault();
                setTried(true);
                if (busy) return;
                // A value still in the field goes in with the rest.
                const draft = stageValue();
                if (!draft) return;
                if (problem || valuesProblem(draft.map((r) => r.value))) return;
                setBusy(true);
                void (option ? update(option, draft) : create(draft)).finally(
                    () => setBusy(false),
                );
            }}
        >
            <div className="grid gap-1.5">
                <Label htmlFor={`${id}-name`}>Option name</Label>
                <Input
                    id={`${id}-name`}
                    value={name}
                    autoFocus
                    disabled={busy}
                    // A placeholder in a field in error reads as typed.
                    placeholder={error ? undefined : "Fragrance"}
                    aria-invalid={!!error}
                    aria-describedby={error ? `${id}-name-error` : undefined}
                    onChange={(e) => setName(e.target.value)}
                />
                {error ? (
                    <p id={`${id}-name-error`} role="alert" className={PROBLEM}>
                        {error}
                    </p>
                ) : null}
            </div>

            <div className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                    <p id={`${id}-values`} className="text-sm font-medium">
                        Values
                    </p>
                    {rows.length > 1 ? (
                        <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            disabled={busy}
                            onClick={() => setRows([...rows].sort(byName))}
                        >
                            Sort A to Z
                        </Button>
                    ) : null}
                </div>
                {rows.length === 0 ? (
                    <EmptyState
                        size="inline"
                        title="No values yet"
                        description="Add the ones your variants pick from."
                    />
                ) : (
                    <ul
                        aria-labelledby={`${id}-values`}
                        className="flex flex-col gap-1.5"
                    >
                        {rows.map((r, i) => (
                            <li
                                key={r.key}
                                onDragOver={(e) => {
                                    if (!dragged.current) return;
                                    e.preventDefault();
                                    move(dragged.current, i);
                                }}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    dragged.current = null;
                                }}
                                className="flex items-center gap-1.5"
                            >
                                <button
                                    type="button"
                                    draggable={!busy}
                                    disabled={busy}
                                    aria-label={`Move ${r.value.trim() || "this value"}, ${i + 1} of ${rows.length}. Use the up and down arrows.`}
                                    onDragStart={(e) => {
                                        dragged.current = r.key;
                                        e.dataTransfer.effectAllowed = "move";
                                    }}
                                    onDragEnd={() => {
                                        dragged.current = null;
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === "ArrowUp") {
                                            e.preventDefault();
                                            move(r.key, i - 1);
                                        } else if (e.key === "ArrowDown") {
                                            e.preventDefault();
                                            move(r.key, i + 1);
                                        }
                                    }}
                                    className="grid size-7 shrink-0 cursor-grab place-items-center rounded-[6px] text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing disabled:cursor-not-allowed coarse:size-11"
                                >
                                    <GripVertical
                                        aria-hidden
                                        className="size-3.5"
                                    />
                                </button>
                                <Input
                                    dense
                                    value={r.value}
                                    disabled={busy}
                                    aria-label={`Value ${i + 1} of ${nd || "this option"}`}
                                    className="min-w-0 flex-1"
                                    onChange={(e) =>
                                        setRows(
                                            rows.map((x) =>
                                                x.key === r.key
                                                    ? {
                                                          ...x,
                                                          value: e.target.value,
                                                      }
                                                    : x,
                                            ),
                                        )
                                    }
                                />
                                {r.variantCount > 0 ? (
                                    <span className="w-[86px] shrink-0 text-right text-[11.5px] text-muted-foreground">
                                        {count(r.variantCount, "variant")}
                                    </span>
                                ) : (
                                    <span className="flex w-[86px] shrink-0 justify-end">
                                        <RemoveValue
                                            value={r.value.trim() || "value"}
                                            disabled={busy}
                                            onClick={() => {
                                                setRows(
                                                    rows.filter(
                                                        (x) => x.key !== r.key,
                                                    ),
                                                );
                                                if (r.id)
                                                    setRemoved([...removed, r]);
                                            }}
                                        />
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
                {listProblem ? (
                    <p role="alert" className={PROBLEM}>
                        {listProblem}
                    </p>
                ) : null}
                <div className="flex gap-2">
                    <Input
                        value={value}
                        disabled={busy}
                        aria-label={`Add a value to ${nd || "this option"}`}
                        aria-invalid={!!valueErr}
                        aria-describedby={`${id}-value-note`}
                        placeholder={valueErr ? undefined : "Add a value"}
                        className="min-w-0 flex-1"
                        onChange={(e) => {
                            setValue(e.target.value);
                            if (valueErr) setValueErr("");
                        }}
                        onKeyDown={(e) => {
                            // Enter adds the value; it never saves the sheet.
                            if (e.key === "Enter") {
                                e.preventDefault();
                                stageValue();
                            }
                        }}
                    />
                    <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        className="shrink-0"
                        onClick={() => stageValue()}
                    >
                        Add value
                    </Button>
                </div>
                <p
                    id={`${id}-value-note`}
                    role={valueErr ? "alert" : undefined}
                    className={
                        valueErr
                            ? PROBLEM
                            : "text-[12px] leading-[1.5] text-muted-foreground"
                    }
                >
                    {valueErr ||
                        (option
                            ? "Renaming a value changes it on every variant that uses it. One in use can't be taken off."
                            : "Type a value and press Enter, or add them later.")}
                </p>
            </div>
        </FormSheet>
    );
}

function RemoveValue({
    value,
    disabled,
    onClick,
}: {
    value: string;
    disabled: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            disabled={disabled}
            aria-label={`Remove ${value}`}
            className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-accent-active disabled:cursor-not-allowed coarse:size-11"
            onClick={onClick}
        >
            <X aria-hidden className="size-3.5" />
        </button>
    );
}
