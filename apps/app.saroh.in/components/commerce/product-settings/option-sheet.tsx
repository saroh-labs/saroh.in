"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { showError, showUndo } from "@saroh/ui/toast";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactElement } from "react";
import { useId, useState } from "react";

import type { CatalogueView } from "@/lib/products/settings";
import {
    addOption,
    addOptionValue,
    removeOption,
    removeOptionValue,
    renameOption,
} from "@/lib/products/settings-actions";

import { PROBLEM, SettingsSheet } from "./settings-sheet";

type Option = CatalogueView["options"][number];
const MAX = 40;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * A new option, or one being edited: its name and the values it offers,
 * managed together and saved with one button. Values are added and taken
 * off in the sheet's own draft; nothing reaches the catalogue until Save,
 * and Cancel drops the lot. A value a variant uses can't be taken off, and
 * says so.
 *
 * Saving an edit is several small calls (the name, each value off, each
 * value on). If one is refused the sheet stays open with what was typed,
 * and Save again sends only what is still to do.
 */
export function OptionSheet({
    trigger,
    option,
    options,
}: {
    trigger: ReactElement;
    /** The option to edit; none makes a new one. */
    option?: Option;
    /** Every option, for "already called that". */
    options: Option[];
}) {
    const router = useRouter();
    const id = useId();
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [tried, setTried] = useState(false);
    const [name, setName] = useState(option?.name ?? "");
    // Saved values taken off in this draft, by id.
    const [removed, setRemoved] = useState<string[]>([]);
    // Values typed in this draft, not saved yet.
    const [added, setAdded] = useState<string[]>([]);
    const [value, setValue] = useState("");
    const [valueErr, setValueErr] = useState("");

    const savedValues = option?.values ?? [];
    const kept = savedValues.filter((v) => !removed.includes(v.id));
    // After a save that stopped half way, a value already added is a saved
    // one: it shows once.
    const fresh = added.filter(
        (a) => !savedValues.some((v) => same(v.value, a)),
    );

    const nd = name.trim();
    const problem = !nd
        ? "An option needs a name."
        : options.some((o) => o.id !== option?.id && same(o.name, nd))
          ? `There is already an option called ${nd}.`
          : nd.length > MAX
            ? `Keep it under ${MAX} characters.`
            : "";
    const error = nd || tried ? problem : "";

    function reset() {
        setTried(false);
        setName(option?.name ?? "");
        setRemoved([]);
        setAdded([]);
        setValue("");
        setValueErr("");
    }

    /**
     * Puts what is typed in the value field into the draft. Returns the
     * draft's new values, or null when the typed one can't be added.
     */
    function stageValue(): { added: string[]; removed: string[] } | null {
        const v = value.trim();
        if (!v) return { added: fresh, removed };
        // One taken off a moment ago comes back rather than being added.
        const back = savedValues.find(
            (x) => removed.includes(x.id) && same(x.value, v),
        );
        if (back) {
            const next = removed.filter((x) => x !== back.id);
            setRemoved(next);
            setValue("");
            return { added: fresh, removed: next };
        }
        if ([...kept.map((x) => x.value), ...fresh].some((x) => same(x, v))) {
            setValueErr(`${v} is already a value.`);
            return null;
        }
        if (v.length > MAX) {
            setValueErr(`Keep a value under ${MAX} characters.`);
            return null;
        }
        const next = [...fresh, v];
        setAdded(next);
        setValue("");
        return { added: next, removed };
    }

    async function create(values: string[]) {
        const res = await addOption(nd, values);
        if (!res.ok) return showError(res.error);
        setOpen(false);
        router.refresh();
        showUndo(`${nd} added.`, () => {
            void removeOption(res.data.id).then((undo) => {
                if (!undo.ok) showError(undo.error);
                router.refresh();
            });
        });
    }

    async function update(
        o: Option,
        draft: { added: string[]; removed: string[] },
    ) {
        // What Undo sends back, in the order it was done.
        const undo: (() => Promise<{ ok: boolean }>)[] = [];
        const refused = (message: string) => {
            // What did save shows in the list behind the sheet.
            router.refresh();
            showError(message);
        };
        const renamed = nd !== o.name;
        if (renamed) {
            const res = await renameOption(o.id, nd);
            if (!res.ok) return refused(res.error);
            undo.push(() => renameOption(o.id, o.name));
        }
        for (const v of o.values.filter((x) => draft.removed.includes(x.id))) {
            const res = await removeOptionValue(o.id, v.id);
            if (!res.ok) return refused(res.error);
            undo.push(() => addOptionValue(o.id, v.value));
        }
        for (const v of draft.added) {
            const res = await addOptionValue(o.id, v);
            if (!res.ok) return refused(res.error);
            undo.push(() => removeOptionValue(o.id, res.data.id));
        }
        setOpen(false);
        if (undo.length === 0) return;
        router.refresh();
        showUndo(
            renamed
                ? `${o.name} is now ${nd}. Customers see the new name.`
                : `${nd} saved.`,
            () => {
                void (async () => {
                    for (const step of undo.reverse()) {
                        const back = await step();
                        if (!back.ok) {
                            showError(
                                `Couldn't undo every change to ${nd}. Check its values.`,
                            );
                            break;
                        }
                    }
                    router.refresh();
                })();
            },
        );
    }

    return (
        <SettingsSheet
            trigger={trigger}
            open={open}
            onOpenChange={(o) => {
                if (o) reset();
                setOpen(o);
            }}
            title={option ? `Edit ${option.name}` : "New option"}
            description={
                option
                    ? "Its name and the values your variants pick from. Customers see the name."
                    : "A way customers choose between variants, such as Size or Shade, and the values it offers."
            }
            pending={busy}
            submitLabel={option ? "Save" : "Add option"}
            busyLabel={option ? "Saving…" : "Adding…"}
            onSubmit={(e) => {
                e.preventDefault();
                setTried(true);
                if (problem || busy) return;
                // A value still in the field goes in with the rest.
                const draft = stageValue();
                if (!draft) return;
                setBusy(true);
                void (
                    option ? update(option, draft) : create(draft.added)
                ).finally(() => setBusy(false));
            }}
        >
            <div className="grid gap-1.5">
                <Label htmlFor={`${id}-name`}>Option name</Label>
                <Input
                    id={`${id}-name`}
                    value={name}
                    autoFocus
                    disabled={busy}
                    placeholder="Fragrance"
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
                <p id={`${id}-values`} className="text-sm font-medium">
                    Values
                </p>
                {kept.length + fresh.length === 0 ? (
                    <p className="text-[12.5px] text-muted-foreground">
                        No values yet. Add the ones your variants pick from.
                    </p>
                ) : (
                    <ul
                        aria-labelledby={`${id}-values`}
                        className="flex flex-wrap gap-1.5"
                    >
                        {kept.map((v) => (
                            <li
                                key={v.id}
                                className="inline-flex min-h-7 items-center gap-1 rounded-full border border-border pl-2.5 pr-1 text-[12.5px]"
                            >
                                {v.value}
                                {v.variantCount > 0 ? (
                                    <span className="pr-1.5 text-[11.5px] text-muted-foreground">
                                        · in use
                                    </span>
                                ) : (
                                    <RemoveValue
                                        value={v.value}
                                        disabled={busy}
                                        onClick={() =>
                                            setRemoved([...removed, v.id])
                                        }
                                    />
                                )}
                            </li>
                        ))}
                        {fresh.map((v) => (
                            <li
                                key={`new-${v}`}
                                className="inline-flex min-h-7 items-center gap-1 rounded-full border border-dashed border-border-strong pl-2.5 pr-1 text-[12.5px]"
                            >
                                {v}
                                <RemoveValue
                                    value={v}
                                    disabled={busy}
                                    onClick={() =>
                                        setAdded(fresh.filter((x) => x !== v))
                                    }
                                />
                            </li>
                        ))}
                    </ul>
                )}
                <div className="flex gap-2">
                    <Input
                        value={value}
                        disabled={busy}
                        aria-label={`Add a value to ${nd || "this option"}`}
                        aria-invalid={!!valueErr}
                        aria-describedby={`${id}-value-note`}
                        placeholder="Add a value"
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
                        disabled={busy || !value.trim()}
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
                            ? "A value in use by a variant cannot be removed. Change the variant first."
                            : "Type a value and press Enter, or add them later.")}
                </p>
            </div>
        </SettingsSheet>
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
            className="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-accent-active disabled:cursor-not-allowed coarse:size-9"
            onClick={onClick}
        >
            <X aria-hidden className="size-3" strokeWidth={2.2} />
        </button>
    );
}
