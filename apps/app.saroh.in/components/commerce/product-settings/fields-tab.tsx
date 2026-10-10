"use client";

import { EmptyState } from "@saroh/ui/data-state";
import { cn } from "@saroh/ui/lib/utils";
import { showError, showUndo } from "@saroh/ui/toast";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import type { CatalogueView, FieldView } from "@/lib/products/settings";
import { removeField, restoreField } from "@/lib/products/settings-actions";

import { ReadOnlyNote } from "@/components/shared/read-only-note";
import { FIELD_TYPES, FieldSheet } from "./field-sheet";
import { bigBtn, rowBtn, TabIntro } from "./product-settings";

const plural = (n: number) => `${n} ${n === 1 ? "product" : "products"}`;
const PILL =
    "rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground/75";

/**
 * Extra things a product records, for the categories picked — "Skin type"
 * for serums, "Fabric care" for dresses. Team only fields stay on the
 * product page; fields on the shop show under the description. Each field
 * is read first; Add field and Edit open the one side sheet, where a change
 * is saved. A delete keeps what was typed, with Undo.
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

    function run(work: () => Promise<void>) {
        start(async () => {
            await work();
            router.refresh();
        });
    }

    const addOne = canWrite ? (
        <FieldSheet
            trigger={
                <button type="button" className={bigBtn}>
                    <Plus aria-hidden className="-ml-0.5 mr-1.5 size-3.5" />
                    Add field
                </button>
            }
            fields={fields}
            categories={categories}
        />
    ) : null;

    return (
        <section>
            <TabIntro
                title="Custom fields"
                // With none yet, the empty state carries the button.
                action={fields.length > 0 ? addOne : null}
            >
                Extra things a product records, for the categories you pick.
                Team only fields stay on the product page; fields on the shop
                show under the description.
            </TabIntro>
            {canWrite ? null : <ReadOnlyNote />}

            {fields.length === 0 ? (
                <EmptyState
                    title="No custom fields yet"
                    description="Add one to record something extra, such as Skin type for serums or Fabric care for dresses."
                    action={addOne}
                />
            ) : (
                <ul className="flex flex-col gap-3">
                    {fields.map((f) => {
                        const typeLabel =
                            FIELD_TYPES.find((t) => t.type === f.type)?.label ??
                            "Text";
                        const cats = categories.filter((c) =>
                            f.categoryIds.includes(c.id),
                        );
                        return (
                            <li
                                key={f.id}
                                className="rounded-[12px] border border-border bg-card px-4 py-3.5"
                            >
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="min-w-0 text-[14px] font-semibold [overflow-wrap:anywhere]">
                                        {f.name}
                                    </span>
                                    <span className={PILL}>{typeLabel}</span>
                                    <span className={PILL}>
                                        {f.onShop ? "On the shop" : "Team only"}
                                    </span>
                                    <span className="flex-[1_1_120px] text-[12px] text-muted-foreground">
                                        {cats.length
                                            ? plural(f.productCount)
                                            : ""}
                                    </span>
                                    {canWrite ? (
                                        <div className="flex shrink-0 gap-1.5">
                                            <FieldSheet
                                                trigger={
                                                    <button
                                                        type="button"
                                                        className={rowBtn}
                                                        aria-label={`Edit ${f.name}`}
                                                    >
                                                        Edit
                                                    </button>
                                                }
                                                field={f}
                                                fields={fields}
                                                categories={categories}
                                            />
                                            <button
                                                type="button"
                                                disabled={pending}
                                                aria-label={`Delete ${f.name}`}
                                                className={cn(
                                                    rowBtn,
                                                    "text-destructive",
                                                )}
                                                onClick={() =>
                                                    run(async () => {
                                                        const res =
                                                            await removeField(
                                                                f.id,
                                                            );
                                                        if (!res.ok)
                                                            return showError(
                                                                res.error,
                                                            );
                                                        showUndo(
                                                            `${f.name} deleted. Values already typed on products are kept for 30 days.`,
                                                            () =>
                                                                run(
                                                                    async () => {
                                                                        const undo =
                                                                            await restoreField(
                                                                                f.id,
                                                                            );
                                                                        if (
                                                                            !undo.ok
                                                                        )
                                                                            showError(
                                                                                undo.error,
                                                                            );
                                                                    },
                                                                ),
                                                        );
                                                    })
                                                }
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    ) : null}
                                </div>
                                {cats.length ? (
                                    <p className="mt-2 text-[12.5px] text-foreground/75">
                                        <span className="font-medium text-foreground">
                                            Asked for products in
                                        </span>{" "}
                                        {cats.map((c) => c.name).join(", ")}
                                    </p>
                                ) : (
                                    <p
                                        role="status"
                                        className="mt-2 text-[12px] text-brand-subtle-foreground"
                                    >
                                        In no category, so no product asks for
                                        it
                                        {canWrite
                                            ? ". Edit it to pick one."
                                            : "."}
                                    </p>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}
