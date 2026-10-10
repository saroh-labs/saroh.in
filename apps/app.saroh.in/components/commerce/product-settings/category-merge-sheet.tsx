"use client";

import type { ReactElement } from "react";
import { useState } from "react";

import type { CatalogueView } from "@/lib/products/settings";

import { chipBtn } from "./product-settings";
import { SettingsSheet } from "./settings-sheet";

type Category = CatalogueView["categories"][number];
const plural = (n: number) => `${n} ${n === 1 ? "product" : "products"}`;

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
        <SettingsSheet
            trigger={trigger}
            open={open}
            onOpenChange={(o) => {
                if (o) setTo(null);
                setOpen(o);
            }}
            title={`Merge ${category.name}`}
            description="Its products move to the category you pick, and it goes away. You can undo it."
            pending={busy}
            submitLabel="Merge category"
            busyLabel="Merging…"
            canSubmit={to !== null}
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
                <div
                    role="radiogroup"
                    aria-label={`Merge ${category.name} into`}
                    className="flex flex-wrap gap-1.5"
                >
                    {targets.map((t) => (
                        <button
                            key={t.id || "none"}
                            type="button"
                            role="radio"
                            aria-checked={to === t.id}
                            disabled={busy}
                            onClick={() => setTo(t.id)}
                            className={chipBtn(to === t.id)}
                        >
                            {t.name}
                        </button>
                    ))}
                </div>
            </div>
            <p
                role="status"
                className="text-pretty rounded-[9px] bg-muted/60 px-3 py-2.5 text-[12.5px] leading-[1.5] text-foreground/75"
            >
                {into === null
                    ? "Pick where its products should go."
                    : `The ${plural(category.productCount)} in ${category.name} move to ${into}, and ${category.name} goes away.`}
            </p>
        </SettingsSheet>
    );
}
