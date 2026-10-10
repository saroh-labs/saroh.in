"use client";

import { EmptyState } from "@saroh/ui/data-state";
import { cn } from "@saroh/ui/lib/utils";
import { showError, showUndo } from "@saroh/ui/toast";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ReadOnlyNote } from "@/components/shared/read-only-note";
import type { CatalogueView, CategoryRemoval } from "@/lib/products/settings";
import {
    addCategory,
    mergeCategory,
    removeCategory,
    renameCategory,
    restoreCategory,
} from "@/lib/products/settings-actions";

import { CategoryMergeSheet } from "./category-merge-sheet";
import { NameDialog } from "./name-dialog";
import { bigBtn, rowBtn, TabIntro } from "./product-settings";

const NAME_MAX = 40;
const plural = (n: number) => `${n} ${n === 1 ? "product" : "products"}`;

type Category = CatalogueView["categories"][number];

/**
 * What each product is — one category per product. The list is read first:
 * New category and Rename open a one-field dialog, Merge a side sheet that
 * says what moves where, and Delete asks first. A change takes effect when
 * its button is pressed, and every one can be undone: a rename, a merge (its
 * products move and it goes), a delete (its products go to Uncategorized).
 */
export function CategoriesTab({ catalogue }: { catalogue: CatalogueView }) {
    const router = useRouter();
    const { categories, uncategorizedCount, canWrite } = catalogue;
    const [, start] = useTransition();
    // The category Delete was pressed on. It stays while the confirm closes,
    // so its words don't change on the way out.
    const [deleting, setDeleting] = useState<Category | null>(null);
    const [confirming, setConfirming] = useState(false);
    // The Delete that was pressed: the confirm hands the keyboard back.
    const deleteFrom = useRef<HTMLButtonElement | null>(null);

    const exists = (name: string, except?: string) =>
        name.trim().toLowerCase() === "uncategorized" ||
        categories.some(
            (c) =>
                c.id !== except &&
                c.name.toLowerCase() === name.trim().toLowerCase(),
        );

    /** An Undo, or a delete: the call, then the list as it now is. */
    function run(work: () => Promise<void>) {
        start(async () => {
            await work();
            router.refresh();
        });
    }

    const undoRemoval = (removal: CategoryRemoval) =>
        run(async () => {
            const undo = await restoreCategory(removal);
            if (!undo.ok) showError(undo.error);
        });

    async function add(name: string) {
        const res = await addCategory(name);
        if (!res.ok) {
            showError(res.error);
            return false;
        }
        router.refresh();
        showUndo(`${name} added.`, () =>
            run(async () => {
                const undo = await removeCategory(res.data.id);
                if (!undo.ok) showError(undo.error);
            }),
        );
        return true;
    }

    async function rename(c: Category, name: string) {
        const res = await renameCategory(c.id, name);
        if (!res.ok) {
            showError(res.error);
            return false;
        }
        router.refresh();
        showUndo(`${c.name} is now ${name}.`, () =>
            run(async () => {
                const undo = await renameCategory(c.id, c.name);
                if (!undo.ok) showError(undo.error);
            }),
        );
        return true;
    }

    async function merge(c: Category, intoId: string | null, into: string) {
        const res = await mergeCategory(c.id, intoId);
        if (!res.ok) {
            showError(res.error);
            return false;
        }
        router.refresh();
        showUndo(`${c.name} merged into ${into}.`, () => undoRemoval(res.data));
        return true;
    }

    function remove(c: Category) {
        run(async () => {
            const res = await removeCategory(c.id);
            if (!res.ok) return showError(res.error);
            showUndo(`${c.name} deleted.`, () => undoRemoval(res.data));
        });
    }

    const newCategory = canWrite ? (
        <NameDialog
            trigger={
                <button type="button" className={bigBtn}>
                    <Plus aria-hidden className="-ml-0.5 mr-1.5 size-3.5" />
                    New category
                </button>
            }
            title="New category"
            note="Products can be put in it as soon as it is added."
            label="Category name"
            placeholder="Lip care"
            submitLabel="Add category"
            busyLabel="Adding…"
            problem={(name) =>
                !name
                    ? "A category needs a name."
                    : exists(name)
                      ? `There is already a category called ${name}.`
                      : name.length > NAME_MAX
                        ? `Keep it under ${NAME_MAX} characters.`
                        : ""
            }
            onSubmit={add}
        />
    ) : null;

    return (
        <section aria-labelledby="tab-categories">
            <TabIntro
                title="Categories"
                // With none yet, the empty state carries the button.
                action={categories.length > 0 ? newCategory : null}
            >
                What each product is — one per product. They drive the
                shop&apos;s filters and your reports. To group products for the
                website, use collections.
            </TabIntro>

            {canWrite ? null : <ReadOnlyNote />}

            {categories.length === 0 ? (
                <EmptyState
                    className="mb-3"
                    title="No categories yet"
                    description={
                        canWrite
                            ? "Add one to say what a product is, such as Lip care. Until then every product is Uncategorized."
                            : "Every product is Uncategorized until someone adds one."
                    }
                    action={newCategory}
                />
            ) : null}

            <ul className="rounded-[12px] border border-border bg-card">
                {categories.map((c) => (
                    <li
                        key={c.id}
                        className="flex flex-wrap items-center gap-2.5 border-b border-border/70 px-4 py-3"
                    >
                        <div className="min-w-0 flex-[1_1_200px]">
                            <p className="text-[13.5px] font-semibold [overflow-wrap:anywhere]">
                                {c.name}
                            </p>
                            <p className="mt-0.5 text-[12px] text-muted-foreground">
                                {plural(c.productCount)}
                            </p>
                        </div>
                        {canWrite ? (
                            <div className="flex shrink-0 gap-1.5">
                                <NameDialog
                                    trigger={
                                        <button
                                            type="button"
                                            className={rowBtn}
                                            aria-label={`Rename ${c.name}`}
                                        >
                                            Rename
                                        </button>
                                    }
                                    title="Rename category"
                                    note="Products in it change with it. Nothing else to do."
                                    label="Name"
                                    initial={c.name}
                                    submitLabel="Save"
                                    problem={(name) =>
                                        !name
                                            ? "A category needs a name."
                                            : name.length > NAME_MAX
                                              ? `Keep it under ${NAME_MAX} characters.`
                                              : exists(name, c.id)
                                                ? "That name is taken — use Merge to combine them."
                                                : ""
                                    }
                                    onSubmit={(name) => rename(c, name)}
                                />
                                <CategoryMergeSheet
                                    trigger={
                                        <button
                                            type="button"
                                            className={rowBtn}
                                            aria-label={`Merge ${c.name}`}
                                        >
                                            Merge
                                        </button>
                                    }
                                    category={c}
                                    others={categories.filter(
                                        (x) => x.id !== c.id,
                                    )}
                                    onMerge={(intoId, into) =>
                                        merge(c, intoId, into)
                                    }
                                />
                                <button
                                    type="button"
                                    className={cn(rowBtn, "text-destructive")}
                                    aria-label={`Delete ${c.name}`}
                                    onClick={(e) => {
                                        deleteFrom.current = e.currentTarget;
                                        setDeleting(c);
                                        setConfirming(true);
                                    }}
                                >
                                    Delete
                                </button>
                            </div>
                        ) : null}
                    </li>
                ))}
                <li className="flex flex-wrap items-center gap-2.5 px-4 py-3">
                    <div className="min-w-0 flex-[1_1_200px]">
                        <p className="text-[13.5px] font-semibold">
                            Uncategorized
                        </p>
                        <p className="mt-0.5 text-[12px] text-muted-foreground">
                            {plural(uncategorizedCount)}
                        </p>
                    </div>
                    <span className="text-[12px] text-muted-foreground">
                        Always there — where products go when their category is
                        removed
                    </span>
                </li>
            </ul>

            {deleting ? (
                <ConfirmDialog
                    open={confirming}
                    onOpenChange={setConfirming}
                    title={`Delete ${deleting.name}?`}
                    description={
                        deleting.productCount
                            ? `Its ${plural(deleting.productCount)} ${deleting.productCount === 1 ? "moves" : "move"} to Uncategorized. The products themselves are not touched. You can undo it.`
                            : "No products use it. You can undo it."
                    }
                    confirmLabel="Delete category"
                    cancelLabel="Keep it"
                    returnFocusTo={deleteFrom}
                    onConfirm={() => remove(deleting)}
                />
            ) : null}
        </section>
    );
}
