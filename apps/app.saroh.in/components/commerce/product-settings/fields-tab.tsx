"use client";

import { cn } from "@saroh/ui/lib/utils";
import { showError, showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type {
    CatalogueView,
    FieldType,
    FieldView,
} from "@/lib/products/settings";
import {
    addField,
    removeField,
    restoreField,
    updateField,
} from "@/lib/products/settings-actions";

import { ReadOnlyNote } from "@/components/shared/read-only-note";
import { bigBtn, chipBtn, rowBtn, TabIntro, textBox } from "./product-settings";

const TYPES: { type: FieldType; label: string }[] = [
    { type: "TEXT", label: "Text" },
    { type: "NUMBER", label: "Number" },
    { type: "DATE", label: "Date" },
    { type: "YES_NO", label: "Yes / no" },
];
const MAX = 40;
const plural = (n: number) => `${n} ${n === 1 ? "product" : "products"}`;

/**
 * Extra things a product records, for the categories picked — "Skin type"
 * for serums, "Fabric care" for dresses. Team only fields stay on the
 * product page; fields on the shop show under the description. A change
 * here takes effect at once; a delete keeps what was typed, with Undo.
 */
export function FieldsTab({
    catalogue,
    fields,
}: {
    catalogue: CatalogueView;
    fields: FieldView[];
}) {
    const router = useRouter();
    const { canWrite, categories } = catalogue;
    const [pending, start] = useTransition();
    const [name, setName] = useState("");
    const [type, setType] = useState<FieldType>("TEXT");

    const nl = name.trim();
    const err =
        nl && fields.some((f) => f.name.toLowerCase() === nl.toLowerCase())
            ? `There is already a field called ${nl}.`
            : nl.length > MAX
              ? `Keep it under ${MAX} characters.`
              : "";

    function run(work: () => Promise<void>) {
        start(async () => {
            await work();
            router.refresh();
        });
    }

    return (
        <section>
            <TabIntro title="Custom fields">
                Extra things a product records, for the categories you pick.
                Team only fields stay on the product page; fields on the shop
                show under the description.
            </TabIntro>
            {canWrite ? null : <ReadOnlyNote />}

            {fields.length === 0 ? (
                <p className="rounded-[12px] border border-dashed border-border-strong px-4 py-3.5 text-[12.5px] leading-[1.5] text-muted-foreground">
                    No custom fields yet. Add one below — say, “Skin type” for
                    serums or “Fabric care” for dresses.
                </p>
            ) : (
                <div className="flex flex-col gap-3">
                    {fields.map((f) => {
                        const typeLabel =
                            TYPES.find((t) => t.type === f.type)?.label ??
                            "Text";
                        const cats = categories.filter((c) =>
                            f.categoryIds.includes(c.id),
                        );
                        return (
                            <div
                                key={f.id}
                                className="rounded-[12px] border border-border bg-card px-4 py-3.5"
                            >
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-[14px] font-semibold">
                                        {f.name}
                                    </span>
                                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground/75">
                                        {typeLabel}
                                    </span>
                                    <span className="flex-[1_1_160px] text-[12px] text-muted-foreground">
                                        {cats.length
                                            ? `${cats.map((c) => c.name).join(", ")} · ${plural(f.productCount)}`
                                            : "No category"}
                                    </span>
                                    <div
                                        role="radiogroup"
                                        aria-label={`${f.name}: who sees it`}
                                        className="flex gap-0.5 rounded-[8px] bg-muted p-0.5"
                                    >
                                        {[
                                            { on: false, label: "Team only" },
                                            { on: true, label: "On the shop" },
                                        ].map((o) => {
                                            const chosen = f.onShop === o.on;
                                            return (
                                                <button
                                                    key={o.label}
                                                    type="button"
                                                    role="radio"
                                                    aria-checked={chosen}
                                                    disabled={
                                                        !canWrite || pending
                                                    }
                                                    onClick={() => {
                                                        if (chosen) return;
                                                        run(async () => {
                                                            const res =
                                                                await updateField(
                                                                    f.id,
                                                                    {
                                                                        onShop: o.on,
                                                                    },
                                                                );
                                                            if (!res.ok)
                                                                return showError(
                                                                    res.error,
                                                                );
                                                            showUndo(
                                                                o.on
                                                                    ? `${f.name} now shows on the shop.`
                                                                    : `${f.name} is team only now.`,
                                                                () =>
                                                                    run(
                                                                        async () => {
                                                                            await updateField(
                                                                                f.id,
                                                                                {
                                                                                    onShop: f.onShop,
                                                                                },
                                                                            );
                                                                        },
                                                                    ),
                                                            );
                                                        });
                                                    }}
                                                    className={cn(
                                                        "rounded-[6px] px-2.5 py-[5px] text-[12px] font-semibold disabled:cursor-not-allowed coarse:min-h-11",
                                                        chosen
                                                            ? "bg-card text-foreground shadow-[0_1px_3px_rgba(28,28,26,0.12)]"
                                                            : "text-muted-foreground",
                                                    )}
                                                >
                                                    {o.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    {canWrite ? (
                                        <button
                                            type="button"
                                            disabled={pending}
                                            className={cn(
                                                rowBtn,
                                                "text-destructive",
                                            )}
                                            onClick={() =>
                                                run(async () => {
                                                    const res =
                                                        await removeField(f.id);
                                                    if (!res.ok)
                                                        return showError(
                                                            res.error,
                                                        );
                                                    showUndo(
                                                        `${f.name} deleted. Values already typed on products are kept for 30 days.`,
                                                        () =>
                                                            run(async () => {
                                                                const undo =
                                                                    await restoreField(
                                                                        f.id,
                                                                    );
                                                                if (!undo.ok)
                                                                    showError(
                                                                        undo.error,
                                                                    );
                                                            }),
                                                    );
                                                })
                                            }
                                        >
                                            Delete
                                        </button>
                                    ) : null}
                                </div>
                                <p className="mb-1.5 mt-3 text-[12px] font-medium">
                                    Asked for products in
                                </p>
                                <div
                                    role="group"
                                    aria-label={`Categories that ask for ${f.name}`}
                                    className="flex flex-wrap gap-1.5"
                                >
                                    {categories.map((c) => {
                                        const on = f.categoryIds.includes(c.id);
                                        return (
                                            <button
                                                key={c.id}
                                                type="button"
                                                aria-pressed={on}
                                                disabled={!canWrite || pending}
                                                onClick={() =>
                                                    run(async () => {
                                                        const res =
                                                            await updateField(
                                                                f.id,
                                                                {
                                                                    categoryIds:
                                                                        on
                                                                            ? f.categoryIds.filter(
                                                                                  (
                                                                                      x,
                                                                                  ) =>
                                                                                      x !==
                                                                                      c.id,
                                                                              )
                                                                            : [
                                                                                  ...f.categoryIds,
                                                                                  c.id,
                                                                              ],
                                                                },
                                                            );
                                                        if (!res.ok)
                                                            showError(
                                                                res.error,
                                                            );
                                                    })
                                                }
                                                className={chipBtn(on)}
                                            >
                                                {c.name}
                                            </button>
                                        );
                                    })}
                                </div>
                                {f.categoryIds.length === 0 ? (
                                    <p
                                        role="status"
                                        className="mt-[7px] text-[11.5px] text-brand-subtle-foreground"
                                    >
                                        In no category — no product will ask for
                                        it.
                                    </p>
                                ) : null}
                            </div>
                        );
                    })}
                </div>
            )}

            {canWrite ? (
                <div className="mt-3.5 rounded-[12px] bg-muted/50 px-3.5 py-[13px]">
                    <p className="mb-2 text-[12.5px] font-semibold">
                        Add a field
                    </p>
                    <form
                        className="flex flex-wrap items-center gap-2"
                        onSubmit={(e) => {
                            e.preventDefault();
                            if (!nl || err) return;
                            run(async () => {
                                const res = await addField(nl, type);
                                if (!res.ok) return showError(res.error);
                                setName("");
                                showUndo(`${nl} added.`, () =>
                                    run(async () => {
                                        const undo = await removeField(
                                            res.data.id,
                                        );
                                        if (!undo.ok) showError(undo.error);
                                    }),
                                );
                            });
                        }}
                    >
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            aria-label="New field name"
                            aria-invalid={!!err}
                            placeholder="Field name, e.g. Skin type"
                            className={cn(
                                textBox,
                                "flex-[1_1_220px]",
                                err ? "border-destructive" : "border-border",
                            )}
                        />
                        <div
                            role="radiogroup"
                            aria-label="Field type"
                            className="flex flex-wrap gap-[5px]"
                        >
                            {TYPES.map((t) => (
                                <button
                                    key={t.type}
                                    type="button"
                                    role="radio"
                                    aria-checked={type === t.type}
                                    onClick={() => setType(t.type)}
                                    className={chipBtn(type === t.type)}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                        <button
                            type="submit"
                            disabled={!nl || !!err || pending}
                            className={bigBtn}
                        >
                            Add field
                        </button>
                    </form>
                    <p
                        className={cn(
                            "mt-2 text-[11.5px]",
                            err ? "text-destructive" : "text-muted-foreground",
                        )}
                    >
                        {err ||
                            "It starts team only and in no category — pick where it applies once it is added."}
                    </p>
                </div>
            ) : null}
        </section>
    );
}
