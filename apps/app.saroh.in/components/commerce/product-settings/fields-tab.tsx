"use client";

import { count } from "@/lib/format/plural";
import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { showError, showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import type { CatalogueView, FieldView } from "@/lib/products/settings";
import { removeField, restoreField } from "@/lib/products/settings-actions";

import { StatusBadge } from "@/components/shared/lists/status-badge";
import { FailedRead } from "@/components/shared/states/failed-read";
import { runAction } from "@/lib/api/run-action";
import { FIELD_TYPES, FieldSheet } from "./field-sheet";
import { SettingsReadOnly, TabIntro } from "./product-settings";

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
    /** null: the list couldn't be read, which is said, never "none yet". */
    fields: FieldView[] | null;
}) {
    if (fields === null) {
        return (
            <section>
                <TabIntro title="Custom fields">
                    Extra things a product records, for the categories you pick.
                </TabIntro>
                <FailedRead
                    size="panel"
                    things="custom fields"
                    reassurance="Products keep the values typed on them."
                />
            </section>
        );
    }
    return <FieldsList catalogue={catalogue} fields={fields} />;
}

function FieldsList({
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
            const reached = await runAction(async () => {
                await work();
                return true;
            });
            if (!reached) return;
            router.refresh();
        });
    }

    const addOne = canWrite ? (
        <FieldSheet
            trigger={
                <Button type="button" className="shrink-0">
                    New field
                </Button>
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
                Team only fields stay on the product page. Fields on the shop
                show under the description.
            </TabIntro>
            {canWrite ? null : <SettingsReadOnly />}

            {fields.length === 0 ? (
                <EmptyState
                    size="panel"
                    title="No custom fields yet"
                    description={fieldsExample(categories)}
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
                                    <StatusBadge tone="tag">
                                        {typeLabel}
                                    </StatusBadge>
                                    <StatusBadge
                                        tone={f.onShop ? "success" : "neutral"}
                                    >
                                        {f.onShop ? "On the shop" : "Team only"}
                                    </StatusBadge>
                                    <span className="flex-[1_1_120px] text-[12px] text-muted-foreground">
                                        {cats.length
                                            ? count(f.productCount, "product")
                                            : ""}
                                    </span>
                                    {canWrite ? (
                                        <div className="flex shrink-0 gap-1.5">
                                            <FieldSheet
                                                trigger={
                                                    <Button
                                                        variant="outline"
                                                        size="xs"
                                                        type="button"
                                                        aria-label={`Edit ${f.name}`}
                                                    >
                                                        Edit
                                                    </Button>
                                                }
                                                field={f}
                                                fields={fields}
                                                categories={categories}
                                            />
                                            <Button
                                                variant="outline"
                                                size="xs"
                                                type="button"
                                                disabled={pending}
                                                aria-label={`Delete ${f.name}`}
                                                className="text-destructive hover:text-destructive"
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
                                            </Button>
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
                                        className="mt-2 text-[12px] text-foreground"
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

/**
 * The empty state's example, from the business's own categories rather
 * than a beauty shop's: "Add one to record something extra for Pickles or
 * Chutneys." With none, it says what a field is for.
 */
export function fieldsExample(categories: { name: string }[]): string {
    const names = categories.slice(0, 2).map((c) => c.name);
    if (names.length === 0)
        return "Add one to record something extra about a product, such as a shelf life or a size guide.";
    return `Add one to record something extra for ${names.join(" or ")}, such as a shelf life or a size guide.`;
}
