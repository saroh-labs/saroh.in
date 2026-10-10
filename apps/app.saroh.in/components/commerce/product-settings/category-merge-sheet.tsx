"use client";

import { count } from "@/lib/format/plural";
import type { ReactElement } from "react";
import { useState } from "react";

import { ChipGroup } from "@/components/shared/choice-group";
import { FormSheet } from "@/components/shared/form-sheet";
import type { CatalogueView } from "@/lib/products/settings";
import { Notice } from "@saroh/ui/notice";

type Category = CatalogueView["categories"][number];
/**
 * Merge a category into another: pick where its products go, read what
 * will move and how many, then Merge. Uncategorized is always a choice.
 * Nothing moves until the button; a refusal keeps the sheet open with the
 * choice made.
 */
export function CategoryMergeSheet({
    trigger,
    category,
    others,
    onMerge,
}: {
    trigger: ReactElement;
    category: Category;
    /** Every other category, in the list's order. */
    others: Category[];
    /** `intoId` null is Uncategorized. Resolves true when it merged. */
    onMerge: (intoId: string | null, intoName: string) => Promise<boolean>;
}) {
    const [open, setOpen] = useState(false);
    // "" is Uncategorized; null is nothing picked yet.
    const [to, setTo] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const targets = [
        ...others.map((x) => ({ id: x.id, name: x.name })),
        { id: "", name: "Uncategorized" },
    ];
    const into =
        to === null ? null : (targets.find((t) => t.id === to)?.name ?? "");

    return (
        <FormSheet
            trigger={trigger}
            open={open}
            onOpen={() => {
                setTo(null);
                setOpen(true);
            }}
            onClose={() => setOpen(false)}
            fieldsClassName="gap-4"
            title={`Merge ${category.name}`}
            description="Its products move to the category you pick, and it goes away. You can undo it."
            pending={busy}
            saveLabel="Merge category"
            savingLabel="Merging…"
            saveOff={to === null}
            onSubmit={(e) => {
                e.preventDefault();
                if (to === null || into === null) return;
                setBusy(true);
                void onMerge(to === "" ? null : to, into).then((ok) => {
                    setBusy(false);
                    if (ok) setOpen(false);
                });
            }}
        >
            <div>
                <p className="mb-2 text-[13px] font-semibold">
                    Merge {category.name} into
                </p>
                <ChipGroup
                    label={`Merge ${category.name} into`}
                    value={to}
                    onChange={setTo}
                    disabled={busy}
                    choices={targets.map((t) => ({
                        value: t.id,
                        label: t.name,
                    }))}
                />
            </div>
            <Notice role="status">
                {into === null
                    ? "Pick where its products should go."
                    : `The ${count(category.productCount, "product")} in ${category.name} move to ${into}, and ${category.name} goes away.`}
            </Notice>
        </FormSheet>
    );
}
