"use client";

import { cn } from "@saroh/ui/lib/utils";
import { showError, showUndo } from "@saroh/ui/toast";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { CatalogueView } from "@/lib/products/settings";
import {
    addOption,
    addOptionValue,
    removeOption,
    removeOptionValue,
    renameOption,
} from "@/lib/products/settings-actions";

import { ReadOnlyNote } from "@/components/shared/read-only-note";
import {
    bigBtn,
    primaryBtn,
    rowBtn,
    smallBtn,
    TabIntro,
    textBox,
} from "./product-settings";

const MAX = 40;
const plural = (n: number) => `${n} ${n === 1 ? "product" : "products"}`;

/**
 * The ways customers choose between variants — Volume, Shade, Size — and
 * the values each offers, spelled one way for every product. A value a
 * variant uses can't go, and an option a product chooses by can't either;
 * both say so rather than failing.
 */
export function OptionsTab({
    storeId,
    catalogue,
}: {
    storeId: string;
    catalogue: CatalogueView;
}) {
    const router = useRouter();
    const { options, canWrite } = catalogue;
    const [pending, start] = useTransition();
    const [renaming, setRenaming] = useState<string | null>(null);
    const [nameDraft, setNameDraft] = useState("");
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [valueErr, setValueErr] = useState<Record<string, string>>({});
    const [newOpt, setNewOpt] = useState("");

    function run(work: () => Promise<void>) {
        start(async () => {
            await work();
            router.refresh();
        });
    }

    const taken = (name: string, except?: string) =>
        options.some(
            (o) =>
                o.id !== except &&
                o.name.toLowerCase() === name.trim().toLowerCase(),
        );
    const no = newOpt.trim();
    const newErr =
        no && taken(no)
            ? `There is already an option called ${no}.`
            : no.length > MAX
              ? `Keep it under ${MAX} characters.`
              : "";

    function addValue(optionId: string, values: { value: string }[]) {
        const v = (drafts[optionId] ?? "").trim();
        if (!v) return;
        if (values.some((x) => x.value.toLowerCase() === v.toLowerCase())) {
            setValueErr({
                ...valueErr,
                [optionId]: `${v} is already a value.`,
            });
            return;
        }
        if (v.length > MAX) {
            setValueErr({
                ...valueErr,
                [optionId]: `Keep a value under ${MAX} characters.`,
            });
            return;
        }
        run(async () => {
            const res = await addOptionValue(storeId, optionId, v);
            if (!res.ok) {
                setValueErr({ ...valueErr, [optionId]: res.error });
                return;
            }
            setDrafts({ ...drafts, [optionId]: "" });
            setValueErr({ ...valueErr, [optionId]: "" });
        });
    }

    return (
        <section>
            <TabIntro title="Options">
                The names your variants use, and the values you pick from.
                Customers see the name: “Shade: Rose nude” rather than “Size”.
            </TabIntro>
            {canWrite ? null : <ReadOnlyNote />}

            <div className="flex flex-col gap-3">
                {options.map((o) => {
                    const ren = renaming === o.id;
                    const nd = nameDraft.trim();
                    const nameErr = !nd
                        ? "An option needs a name."
                        : taken(nd, o.id)
                          ? `There is already an option called ${nd}.`
                          : nd.length > MAX
                            ? `Keep it under ${MAX} characters.`
                            : "";
                    const used = o.productCount > 0;
                    const usedLine = `Used by ${plural(o.productCount)} — change their variants first.`;
                    return (
                        <div
                            key={o.id}
                            className="rounded-[12px] border border-border bg-card px-4 py-3.5"
                        >
                            {ren ? (
                                <form
                                    className="flex flex-wrap items-center gap-2"
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        if (nameErr) return;
                                        if (nd === o.name) {
                                            setRenaming(null);
                                            return;
                                        }
                                        run(async () => {
                                            const res = await renameOption(
                                                storeId,
                                                o.id,
                                                nd,
                                            );
                                            if (!res.ok)
                                                return showError(res.error);
                                            setRenaming(null);
                                            showUndo(
                                                `${o.name} is now ${nd}. Customers see the new name.`,
                                                () =>
                                                    run(async () => {
                                                        const undo =
                                                            await renameOption(
                                                                storeId,
                                                                o.id,
                                                                o.name,
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
                                        value={nameDraft}
                                        autoFocus
                                        onChange={(e) =>
                                            setNameDraft(e.target.value)
                                        }
                                        aria-label={`New name for ${o.name}`}
                                        className={cn(
                                            textBox,
                                            "h-8 flex-[1_1_180px] rounded-[7px] px-[9px]",
                                            nameErr && nd
                                                ? "border-destructive"
                                                : "border-border",
                                        )}
                                    />
                                    <button
                                        type="submit"
                                        disabled={!!nameErr || pending}
                                        className={primaryBtn}
                                    >
                                        Save
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setRenaming(null)}
                                        className={smallBtn}
                                    >
                                        Cancel
                                    </button>
                                    {nameErr && nd ? (
                                        <span
                                            role="alert"
                                            className="basis-full text-[11.5px] text-destructive"
                                        >
                                            {nameErr}
                                        </span>
                                    ) : null}
                                </form>
                            ) : (
                                <>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="flex-1 text-[14px] font-semibold">
                                            {o.name}
                                        </span>
                                        <span className="text-[12px] text-muted-foreground">
                                            Used by {plural(o.productCount)}
                                        </span>
                                        {canWrite ? (
                                            <>
                                                <button
                                                    type="button"
                                                    className={cn(
                                                        rowBtn,
                                                        "h-[26px] px-[9px]",
                                                    )}
                                                    onClick={() => {
                                                        setRenaming(o.id);
                                                        setNameDraft(o.name);
                                                    }}
                                                >
                                                    Rename
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={used || pending}
                                                    title={
                                                        used
                                                            ? usedLine
                                                            : `Delete ${o.name}`
                                                    }
                                                    className={cn(
                                                        rowBtn,
                                                        "h-[26px] px-[9px]",
                                                        !used &&
                                                            "text-destructive",
                                                    )}
                                                    onClick={() =>
                                                        run(async () => {
                                                            const res =
                                                                await removeOption(
                                                                    storeId,
                                                                    o.id,
                                                                );
                                                            if (!res.ok)
                                                                return showError(
                                                                    res.error,
                                                                );
                                                            showUndo(
                                                                `${o.name} deleted.`,
                                                                () =>
                                                                    run(
                                                                        async () => {
                                                                            const undo =
                                                                                await addOption(
                                                                                    storeId,
                                                                                    res
                                                                                        .data
                                                                                        .name,
                                                                                    res
                                                                                        .data
                                                                                        .values,
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
                                            </>
                                        ) : null}
                                    </div>
                                    {used && canWrite ? (
                                        <p className="mt-1 text-[11.5px] text-muted-foreground">
                                            {usedLine}
                                        </p>
                                    ) : null}
                                </>
                            )}

                            <div className="mt-2.5 flex flex-wrap gap-1.5">
                                {o.values.map((v) => {
                                    const inUse = v.variantCount > 0;
                                    return (
                                        <span
                                            key={v.id}
                                            className="inline-flex h-7 items-center gap-1 rounded-full border border-border pl-2.5 pr-1 text-[12.5px]"
                                        >
                                            {v.value}
                                            {canWrite ? (
                                                <button
                                                    type="button"
                                                    disabled={inUse || pending}
                                                    aria-label={
                                                        inUse
                                                            ? `${v.value} is used by a variant, so it cannot be removed`
                                                            : `Remove ${v.value}`
                                                    }
                                                    title={
                                                        inUse
                                                            ? `${v.value} is used by a variant, so it cannot be removed`
                                                            : `Remove ${v.value}`
                                                    }
                                                    className="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:text-muted-foreground/40 coarse:size-9"
                                                    onClick={() =>
                                                        run(async () => {
                                                            const res =
                                                                await removeOptionValue(
                                                                    storeId,
                                                                    o.id,
                                                                    v.id,
                                                                );
                                                            if (!res.ok)
                                                                return showError(
                                                                    res.error,
                                                                );
                                                            showUndo(
                                                                `${v.value} removed from ${o.name}.`,
                                                                () =>
                                                                    run(
                                                                        async () => {
                                                                            const undo =
                                                                                await addOptionValue(
                                                                                    storeId,
                                                                                    o.id,
                                                                                    v.value,
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
                                                    <X
                                                        aria-hidden
                                                        className="size-3"
                                                        strokeWidth={2.2}
                                                    />
                                                </button>
                                            ) : null}
                                        </span>
                                    );
                                })}
                                {canWrite ? (
                                    <input
                                        value={drafts[o.id] ?? ""}
                                        onChange={(e) => {
                                            setDrafts({
                                                ...drafts,
                                                [o.id]: e.target.value,
                                            });
                                            if (valueErr[o.id])
                                                setValueErr({
                                                    ...valueErr,
                                                    [o.id]: "",
                                                });
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                e.preventDefault();
                                                addValue(o.id, o.values);
                                            }
                                        }}
                                        aria-label={`Add a value to ${o.name}`}
                                        placeholder="Add a value, press Enter"
                                        className={cn(
                                            "h-7 w-[170px] rounded-full border border-dashed bg-transparent px-2.5 text-[12.5px] placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:h-11",
                                            valueErr[o.id]
                                                ? "border-destructive"
                                                : "border-border-strong",
                                        )}
                                    />
                                ) : null}
                            </div>
                            <p
                                role={valueErr[o.id] ? "alert" : undefined}
                                className={cn(
                                    "mt-2 text-[11.5px]",
                                    valueErr[o.id]
                                        ? "text-destructive"
                                        : "text-muted-foreground",
                                )}
                            >
                                {valueErr[o.id] ||
                                    "A value in use by a variant cannot be removed — change the variant first."}
                            </p>
                        </div>
                    );
                })}
            </div>

            {canWrite ? (
                <>
                    <form
                        className="mt-3.5 flex flex-wrap gap-2"
                        onSubmit={(e) => {
                            e.preventDefault();
                            if (!no || newErr) return;
                            run(async () => {
                                const res = await addOption(storeId, no);
                                if (!res.ok) return showError(res.error);
                                setNewOpt("");
                                showUndo(
                                    `${no} added. Add its values below it.`,
                                    () =>
                                        run(async () => {
                                            const undo = await removeOption(
                                                storeId,
                                                res.data.id,
                                            );
                                            if (!undo.ok) showError(undo.error);
                                        }),
                                );
                            });
                        }}
                    >
                        <input
                            value={newOpt}
                            onChange={(e) => setNewOpt(e.target.value)}
                            aria-label="New option name"
                            aria-invalid={!!newErr}
                            placeholder="New option, e.g. Fragrance"
                            className={cn(
                                textBox,
                                "flex-[1_1_220px]",
                                newErr ? "border-destructive" : "border-border",
                            )}
                        />
                        <button
                            type="submit"
                            disabled={!no || !!newErr || pending}
                            className={bigBtn}
                        >
                            Add option
                        </button>
                    </form>
                    {newErr ? (
                        <p
                            role="alert"
                            className="mt-1.5 text-[12px] text-destructive"
                        >
                            {newErr}
                        </p>
                    ) : null}
                </>
            ) : null}
        </section>
    );
}
