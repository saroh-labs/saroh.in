"use client";

import { cn } from "@saroh/ui/lib/utils";
import { showError, showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { CatalogueView } from "@/lib/products/settings";
import {
    addCategory,
    mergeCategory,
    removeCategory,
    renameCategory,
    restoreCategory,
} from "@/lib/products/settings-actions";

import {
    bigBtn,
    chipBtn,
    primaryBtn,
    rowBtn,
    smallBtn,
    TabIntro,
    textBox,
} from "./product-settings";

const NAME_MAX = 40;
const plural = (n: number) => `${n} ${n === 1 ? "product" : "products"}`;

type Mode =
    | { id: string; kind: "rename" }
    | { id: string; kind: "merge" }
    | { id: string; kind: "delete" };

/**
 * What each product is — one category per product. A change here takes
 * effect at once, and every one can be undone: a rename, a merge (its
 * products move and it goes), a delete (its products go to Uncategorized).
 */
export function CategoriesTab({
    storeId,
    catalogue,
}: {
    storeId: string;
    catalogue: CatalogueView;
}) {
    const router = useRouter();
    const { categories, uncategorizedCount, canWrite } = catalogue;
    const [pending, start] = useTransition();
    const [newName, setNewName] = useState("");
    const [mode, setMode] = useState<Mode | null>(null);
    const [draft, setDraft] = useState("");
    // "" is Uncategorized; null is nothing picked yet.
    const [mergeTo, setMergeTo] = useState<string | null>(null);

    const exists = (name: string, except?: string) =>
        name.trim().toLowerCase() === "uncategorized" ||
        categories.some(
            (c) =>
                c.id !== except &&
                c.name.toLowerCase() === name.trim().toLowerCase(),
        );
    const nn = newName.trim();
    const newErr =
        nn && exists(nn)
            ? `There is already a category called ${nn}.`
            : nn.length > NAME_MAX
              ? `Keep it under ${NAME_MAX} characters.`
              : "";

    function run(work: () => Promise<void>) {
        start(async () => {
            await work();
            router.refresh();
        });
    }

    function add() {
        if (!nn || newErr) return;
        run(async () => {
            const res = await addCategory(storeId, nn);
            if (!res.ok) return showError(res.error);
            setNewName("");
            showUndo(`${nn} added.`, () =>
                run(async () => {
                    const undo = await removeCategory(storeId, res.data.id);
                    if (!undo.ok) showError(undo.error);
                }),
            );
        });
    }

    const cancel = () => {
        setMode(null);
        setMergeTo(null);
        setDraft("");
    };

    return (
        <section aria-labelledby="tab-categories">
            <TabIntro title="Categories">
                What each product is — one per product. They drive the
                shop&apos;s filters and your reports. To group products for the
                website, use collections.
            </TabIntro>

            {canWrite ? (
                <>
                    <div className="mb-3.5 flex flex-wrap gap-2">
                        <input
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    add();
                                }
                            }}
                            aria-label="New category name"
                            aria-invalid={!!newErr}
                            placeholder="New category, e.g. Lip care"
                            className={cn(
                                textBox,
                                "flex-[1_1_220px]",
                                newErr ? "border-destructive" : "border-border",
                            )}
                        />
                        <button
                            type="button"
                            disabled={!nn || !!newErr || pending}
                            onClick={add}
                            className={bigBtn}
                        >
                            Add category
                        </button>
                    </div>
                    {newErr ? (
                        <p
                            role="alert"
                            className="-mt-2 mb-3 text-[12px] text-destructive"
                        >
                            {newErr}
                        </p>
                    ) : null}
                </>
            ) : (
                <ReadOnlyNote />
            )}

            <ul className="rounded-[12px] border border-border bg-card">
                {categories.map((c) => {
                    const me = mode?.id === c.id ? mode.kind : null;
                    const dn = draft.trim();
                    const renameErr = !dn
                        ? "A category needs a name."
                        : dn.length > NAME_MAX
                          ? `Keep it under ${NAME_MAX} characters.`
                          : exists(dn, c.id)
                            ? "That name is taken — use Merge to combine them."
                            : "";
                    const into =
                        mergeTo === null
                            ? null
                            : mergeTo === ""
                              ? "Uncategorized"
                              : (categories.find((x) => x.id === mergeTo)
                                    ?.name ?? "");
                    return (
                        <li
                            key={c.id}
                            className={cn(
                                "border-b border-border/70 px-4 py-3 last:border-b-0",
                                me && "bg-muted/50",
                            )}
                        >
                            {me === null ? (
                                <div className="flex flex-wrap items-center gap-2.5">
                                    <div className="min-w-0 flex-[1_1_200px]">
                                        <p className="text-[13.5px] font-semibold">
                                            {c.name}
                                        </p>
                                        <p className="mt-0.5 text-[12px] text-muted-foreground">
                                            {plural(c.productCount)}
                                        </p>
                                    </div>
                                    {canWrite ? (
                                        <div className="flex gap-1.5">
                                            <button
                                                type="button"
                                                className={rowBtn}
                                                onClick={() => {
                                                    setMode({
                                                        id: c.id,
                                                        kind: "rename",
                                                    });
                                                    setDraft(c.name);
                                                }}
                                            >
                                                Rename
                                            </button>
                                            <button
                                                type="button"
                                                className={rowBtn}
                                                onClick={() => {
                                                    setMode({
                                                        id: c.id,
                                                        kind: "merge",
                                                    });
                                                    setMergeTo(null);
                                                }}
                                            >
                                                Merge
                                            </button>
                                            <button
                                                type="button"
                                                className={cn(
                                                    rowBtn,
                                                    "text-destructive",
                                                )}
                                                onClick={() =>
                                                    setMode({
                                                        id: c.id,
                                                        kind: "delete",
                                                    })
                                                }
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    ) : null}
                                </div>
                            ) : null}

                            {me === "rename" ? (
                                <form
                                    className="flex flex-wrap items-center gap-2"
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        if (renameErr) return;
                                        if (dn === c.name) return cancel();
                                        run(async () => {
                                            const res = await renameCategory(
                                                storeId,
                                                c.id,
                                                dn,
                                            );
                                            if (!res.ok)
                                                return showError(res.error);
                                            cancel();
                                            showUndo(
                                                `${c.name} is now ${dn}.`,
                                                () =>
                                                    run(async () => {
                                                        const undo =
                                                            await renameCategory(
                                                                storeId,
                                                                c.id,
                                                                c.name,
                                                            );
                                                        if (!undo.ok)
                                                            showError(
                                                                undo.error,
                                                            );
                                                    }),
                                            );
                                        });
                                    }}
                                >
                                    <input
                                        value={draft}
                                        autoFocus
                                        onChange={(e) =>
                                            setDraft(e.target.value)
                                        }
                                        aria-label={`New name for ${c.name}`}
                                        className={cn(
                                            textBox,
                                            "h-8 flex-[1_1_200px] rounded-[7px] px-[9px]",
                                            renameErr && dn
                                                ? "border-destructive"
                                                : "border-border",
                                        )}
                                    />
                                    <button
                                        type="submit"
                                        disabled={!!renameErr || pending}
                                        className={primaryBtn}
                                    >
                                        Save
                                    </button>
                                    <button
                                        type="button"
                                        onClick={cancel}
                                        className={smallBtn}
                                    >
                                        Cancel
                                    </button>
                                    <span
                                        className={cn(
                                            "basis-full text-[11.5px]",
                                            renameErr
                                                ? "text-destructive"
                                                : "text-muted-foreground",
                                        )}
                                    >
                                        {renameErr ||
                                            "Products in it change with it. Nothing else to do."}
                                    </span>
                                </form>
                            ) : null}

                            {me === "merge" ? (
                                <div>
                                    <p className="mb-2 text-[13px] font-semibold">
                                        Merge {c.name} into…
                                    </p>
                                    <div
                                        role="radiogroup"
                                        aria-label={`Merge ${c.name} into`}
                                        className="flex flex-wrap gap-1.5"
                                    >
                                        {[
                                            ...categories
                                                .filter((x) => x.id !== c.id)
                                                .map((x) => ({
                                                    id: x.id,
                                                    name: x.name,
                                                })),
                                            { id: "", name: "Uncategorized" },
                                        ].map((t) => (
                                            <button
                                                key={t.id || "none"}
                                                type="button"
                                                role="radio"
                                                aria-checked={mergeTo === t.id}
                                                onClick={() => setMergeTo(t.id)}
                                                className={chipBtn(
                                                    mergeTo === t.id,
                                                )}
                                            >
                                                {t.name}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                                        <span className="flex-[1_1_220px] text-[12px] text-foreground/75">
                                            {into === null
                                                ? "Pick where its products should go."
                                                : `The ${plural(c.productCount)} in ${c.name} move to ${into}, and ${c.name} goes away.`}
                                        </span>
                                        <button
                                            type="button"
                                            disabled={
                                                mergeTo === null || pending
                                            }
                                            className={primaryBtn}
                                            onClick={() =>
                                                run(async () => {
                                                    const res =
                                                        await mergeCategory(
                                                            storeId,
                                                            c.id,
                                                            mergeTo === ""
                                                                ? null
                                                                : mergeTo,
                                                        );
                                                    if (!res.ok)
                                                        return showError(
                                                            res.error,
                                                        );
                                                    cancel();
                                                    showUndo(
                                                        `${c.name} merged into ${into ?? ""}.`,
                                                        () =>
                                                            run(async () => {
                                                                const undo =
                                                                    await restoreCategory(
                                                                        storeId,
                                                                        res.data,
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
                                            Merge
                                        </button>
                                        <button
                                            type="button"
                                            onClick={cancel}
                                            className={smallBtn}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            ) : null}

                            {me === "delete" ? (
                                <div
                                    role="alert"
                                    className="flex flex-wrap items-center gap-2 rounded-[9px] bg-destructive-subtle px-3 py-2.5"
                                >
                                    <span className="flex-[1_1_240px] text-pretty text-[12.5px] leading-[1.5] text-destructive">
                                        {c.productCount
                                            ? `Its ${plural(c.productCount)} ${c.productCount === 1 ? "moves" : "move"} to Uncategorized. The products themselves are not touched.`
                                            : "No products use it."}
                                    </span>
                                    <button
                                        type="button"
                                        disabled={pending}
                                        className="inline-flex h-[30px] items-center rounded-[7px] bg-destructive px-[11px] text-[12px] font-semibold text-destructive-foreground hover:bg-destructive/90 coarse:h-11"
                                        onClick={() =>
                                            run(async () => {
                                                const res =
                                                    await removeCategory(
                                                        storeId,
                                                        c.id,
                                                    );
                                                if (!res.ok)
                                                    return showError(res.error);
                                                cancel();
                                                showUndo(
                                                    `${c.name} deleted.`,
                                                    () =>
                                                        run(async () => {
                                                            const undo =
                                                                await restoreCategory(
                                                                    storeId,
                                                                    res.data,
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
                                        Delete {c.name}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={cancel}
                                        className={smallBtn}
                                    >
                                        Keep it
                                    </button>
                                </div>
                            ) : null}
                        </li>
                    );
                })}
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
        </section>
    );
}

export function ReadOnlyNote() {
    return (
        <p
            role="note"
            className="mb-3.5 rounded-[9px] bg-muted/60 px-3 py-2.5 text-[12.5px] leading-[1.5] text-foreground/75"
        >
            Your role can read these settings but not change them. An owner or
            admin can change what your role reaches in Team.
        </p>
    );
}
