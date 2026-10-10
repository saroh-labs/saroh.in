"use client";

import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { showError, showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import type { ReactElement } from "react";
import { useId, useState } from "react";

import type {
    CatalogueView,
    FieldType,
    FieldView,
} from "@/lib/products/settings";
import {
    addField,
    removeField,
    updateField,
} from "@/lib/products/settings-actions";

import { chipClass } from "@/components/shared/chip";
import { FormSheet } from "@/components/shared/form-sheet";
import { Segmented } from "@saroh/ui/segmented";
import { PROBLEM } from "./product-settings";

export const FIELD_TYPES: { type: FieldType; label: string }[] = [
    { type: "TEXT", label: "Text" },
    { type: "NUMBER", label: "Number" },
    { type: "DATE", label: "Date" },
    { type: "YES_NO", label: "Yes / no" },
];
const MAX = 40;
const WHO = [
    { on: false, label: "Team only" },
    { on: true, label: "On the shop" },
];

const sameSet = (a: string[], b: string[]) =>
    a.length === b.length && a.every((x) => b.includes(x));

/**
 * Add a custom field, or edit one: its name, its type (fixed once added),
 * who sees it and the categories whose products ask for it, saved together
 * with one button. Nothing changes until then; a refusal keeps the sheet
 * open with what was typed, and Cancel drops it.
 *
 * Adding is two calls (the field, then where it applies). If the second is
 * refused the field exists, so the sheet carries on as an edit of it rather
 * than adding it twice.
 */
export function FieldSheet({
    trigger,
    field,
    fields,
    categories,
}: {
    trigger: ReactElement;
    /** The field to edit; none adds one. */
    field?: FieldView;
    /** Every field, for "already called that". */
    fields: FieldView[];
    categories: CatalogueView["categories"];
}) {
    const router = useRouter();
    const id = useId();
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [tried, setTried] = useState(false);
    // Added by this opening, when what came after it was refused.
    const [created, setCreated] = useState<FieldView | null>(null);
    const [name, setName] = useState(field?.name ?? "");
    const [type, setType] = useState<FieldType>(field?.type ?? "TEXT");
    const [onShop, setOnShop] = useState(field?.onShop ?? false);
    const [categoryIds, setCategoryIds] = useState<string[]>(
        field?.categoryIds ?? [],
    );

    const saved = field ?? created;
    const nl = name.trim();
    const problem = !nl
        ? "A field needs a name."
        : fields.some(
                (f) =>
                    f.id !== saved?.id &&
                    f.name.toLowerCase() === nl.toLowerCase(),
            )
          ? `There is already a field called ${nl}.`
          : nl.length > MAX
            ? `Keep it under ${MAX} characters.`
            : "";
    const error = nl || tried ? problem : "";

    function reset() {
        setCreated(null);
        setTried(false);
        setName(field?.name ?? "");
        setType(field?.type ?? "TEXT");
        setOnShop(field?.onShop ?? false);
        setCategoryIds(field?.categoryIds ?? []);
    }

    async function save() {
        let target = saved;
        if (!target) {
            const res = await addField(nl, type);
            if (!res.ok) return showError(res.error);
            target = res.data;
            setCreated(target);
        }
        const before = target;
        const patch: Parameters<typeof updateField>[1] = {
            ...(nl !== before.name ? { name: nl } : {}),
            ...(onShop !== before.onShop ? { onShop } : {}),
            ...(sameSet(categoryIds, before.categoryIds)
                ? {}
                : { categoryIds }),
        };
        if (Object.keys(patch).length > 0) {
            const res = await updateField(before.id, patch);
            if (!res.ok) {
                // A field just added shows in the list behind the sheet.
                router.refresh();
                return showError(res.error);
            }
        }
        setOpen(false);
        router.refresh();
        if (!field) {
            showUndo(`${nl} added.`, async () => {
                const back = await removeField(before.id);
                router.refresh();
                return back;
            });
            return;
        }
        if (Object.keys(patch).length === 0) return;
        const only = Object.keys(patch).length === 1 && "onShop" in patch;
        showUndo(
            only
                ? onShop
                    ? `${nl} now shows on the shop.`
                    : `${nl} is team only now.`
                : `${nl} saved.`,
            async () => {
                const back = await updateField(before.id, {
                    name: before.name,
                    onShop: before.onShop,
                    categoryIds: before.categoryIds,
                });
                router.refresh();
                return back;
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
            title={field ? "Edit field" : "New field"}
            description={
                field
                    ? "Change its name, who sees it and which products ask for it."
                    : "Something extra a product records, such as Skin type for serums or Fabric care for dresses."
            }
            pending={busy}
            saveLabel={field ? "Save" : "Add field"}
            savingLabel={field ? "Saving…" : "Adding…"}
            onSubmit={(e) => {
                e.preventDefault();
                setTried(true);
                if (problem || busy) return;
                setBusy(true);
                void save().finally(() => setBusy(false));
            }}
        >
            <div className="grid gap-1.5">
                <Label htmlFor={`${id}-name`}>Field name</Label>
                <Input
                    id={`${id}-name`}
                    value={name}
                    autoFocus
                    disabled={busy}
                    placeholder="Skin type"
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

            <div className="grid gap-1.5">
                <p id={`${id}-type`} className="text-sm font-medium">
                    Type
                </p>
                {saved ? (
                    <p className="text-[13px] text-foreground/75">
                        {FIELD_TYPES.find((t) => t.type === saved.type)
                            ?.label ?? "Text"}
                        . A field&apos;s type can&apos;t be changed once it is
                        added.
                    </p>
                ) : (
                    <div
                        role="radiogroup"
                        aria-labelledby={`${id}-type`}
                        className="flex flex-wrap gap-[5px]"
                    >
                        {FIELD_TYPES.map((t) => (
                            <button
                                key={t.type}
                                type="button"
                                role="radio"
                                aria-checked={type === t.type}
                                disabled={busy}
                                onClick={() => setType(t.type)}
                                className={chipClass(type === t.type)}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className="grid gap-1.5">
                <p id={`${id}-who`} className="text-sm font-medium">
                    Who sees it
                </p>
                <Segmented
                    label="Who sees it"
                    aria-labelledby={`${id}-who`}
                    value={onShop ? "shop" : "team"}
                    onValueChange={(v) => setOnShop(v === "shop")}
                    disabled={busy}
                    options={WHO.map((o) => ({
                        value: o.on ? "shop" : "team",
                        label: o.label,
                    }))}
                />
                <p className="text-[12px] text-muted-foreground">
                    {onShop
                        ? "Customers see it under the product's description."
                        : "It stays on the product page, for your team."}
                </p>
            </div>

            <div className="grid gap-1.5">
                <p id={`${id}-cats`} className="text-sm font-medium">
                    Asked for products in
                </p>
                {categories.length === 0 ? (
                    <p className="text-[12.5px] text-muted-foreground">
                        There are no categories yet. Add one on the Categories
                        tab, then pick it here.
                    </p>
                ) : (
                    <div
                        role="group"
                        aria-labelledby={`${id}-cats`}
                        className="flex flex-wrap gap-1.5"
                    >
                        {categories.map((c) => {
                            const on = categoryIds.includes(c.id);
                            return (
                                <button
                                    key={c.id}
                                    type="button"
                                    aria-pressed={on}
                                    disabled={busy}
                                    onClick={() =>
                                        setCategoryIds(
                                            on
                                                ? categoryIds.filter(
                                                      (x) => x !== c.id,
                                                  )
                                                : [...categoryIds, c.id],
                                        )
                                    }
                                    className={chipClass(on)}
                                >
                                    {c.name}
                                </button>
                            );
                        })}
                    </div>
                )}
                {categoryIds.length === 0 && categories.length > 0 ? (
                    <p role="status" className="text-[11.5px] text-foreground">
                        In no category, so no product will ask for it.
                    </p>
                ) : null}
            </div>
        </FormSheet>
    );
}
