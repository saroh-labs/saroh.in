"use client";

import { Button } from "@saroh/ui/button";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from "@saroh/ui/sheet";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { PickableProduct } from "@/lib/collections/actions";
import {
    loadCollection,
    removeCollection,
    saveCollection,
    saveNewCollection,
} from "@/lib/collections/actions";
import type { CategoryNode, SheetValues } from "@/lib/collections/rules";
import {
    createBody,
    editChanges,
    sheetProblem,
    websiteLine,
} from "@/lib/collections/rules";
import type { CollectionDetail } from "@/lib/collections/service";

import {
    CategoryField,
    DescriptionField,
    DiscardBar,
    NameField,
    SheetNotices,
} from "./collection-fields";
import { KindChoice } from "./kind-choice";
import { ProductsPicker } from "./products-picker";

type Field = "name" | "description" | "categoryId" | "productIds";

const BLANK: SheetValues = {
    name: "",
    description: "",
    kind: "HAND_PICKED",
    categoryId: "",
    productIds: [],
};

function valuesOf(c: CollectionDetail): SheetValues {
    return {
        name: c.name,
        description: c.description ?? "",
        kind: c.kind,
        categoryId: c.category?.id ?? "",
        productIds: c.products.map((p) => p.id),
    };
}

/**
 * New collection and Edit collection (#524), over the Products list or the
 * product page. A name, an optional line, and how it fills: products
 * picked by hand, in order, or automatically from a category and the ones
 * inside it. The kind is chosen once — the API never turns one into the
 * other. Edit also says where the website shows it, and holds Delete.
 *
 * `canWrite` false (no `store:write`): the same sheet, read-only, saying so.
 */
export function CollectionSheet({
    open,
    onOpenChange,
    collectionId,
    categories,
    canWrite,
    onSaved,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Null: a new one. */
    collectionId: string | null;
    categories: CategoryNode[];
    canWrite: boolean;
    /** After a save or a delete; the page is refreshed either way. */
    onSaved?: () => void;
}) {
    const router = useRouter();
    const editing = collectionId !== null;
    const [before, setBefore] = useState<SheetValues>(BLANK);
    const [values, setValues] = useState<SheetValues>(BLANK);
    const [detail, setDetail] = useState<CollectionDetail | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [known, setKnown] = useState(new Map<string, PickableProduct>());
    const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
    const [saving, setSaving] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [askDelete, setAskDelete] = useState(false);

    // Each opening starts from what is saved: blank, or the collection read
    // fresh — never a draft from the last time (reset while rendering; the
    // read, which is async, in an effect).
    const [shown, setShown] = useState<{ open: boolean; id: string | null }>({
        open: false,
        id: null,
    });
    if (shown.open !== open || shown.id !== collectionId) {
        setShown({ open, id: collectionId });
        if (open) {
            setErrors({});
            setConfirming(false);
            setAskDelete(false);
            setLoadError(null);
            setDetail(null);
            setBefore(BLANK);
            setValues(BLANK);
        }
    }
    useEffect(() => {
        if (!open || !collectionId) return;
        let live = true;
        void loadCollection(collectionId).then((res) => {
            if (!live) return;
            if (!res.ok) {
                setLoadError(res.error);
                return;
            }
            const v = valuesOf(res.data);
            setDetail(res.data);
            setBefore(v);
            setValues(v);
            setKnown(
                new Map(
                    res.data.products.map((p) => [
                        p.id,
                        {
                            id: p.id,
                            name: p.name,
                            image: p.image,
                            status: p.status,
                        },
                    ]),
                ),
            );
        });
        return () => {
            live = false;
        };
    }, [open, collectionId]);

    const loading = editing && !detail && !loadError;
    const readOnly = !canWrite || loading || !!loadError;
    const changes = editChanges(before, values);
    const dirty = editing
        ? Object.keys(changes.patch).length > 0 || changes.products !== null
        : values.name.trim() !== "" ||
          values.description.trim() !== "" ||
          values.categoryId !== "" ||
          values.productIds.length > 0;

    function set<K extends keyof SheetValues>(key: K, value: SheetValues[K]) {
        setValues((v) => ({ ...v, [key]: value }));
        setErrors((e) => ({ ...e, [key]: undefined }));
    }

    function requestClose(next: boolean) {
        if (next) return onOpenChange(true);
        if (saving) return;
        if (dirty && canWrite) {
            setConfirming(true);
            return;
        }
        onOpenChange(false);
    }

    function done(message: string) {
        showSuccess(message);
        onOpenChange(false);
        onSaved?.();
        router.refresh();
    }

    async function save() {
        const problem = sheetProblem(values);
        if (problem) {
            setErrors({ [problem.field]: problem.message });
            return;
        }
        setSaving(true);
        const res =
            collectionId !== null
                ? await saveCollection(
                      collectionId,
                      changes.patch,
                      changes.products,
                  )
                : await saveNewCollection(createBody(values));
        setSaving(false);
        if (!res.ok) {
            const field = (
                ["name", "description", "categoryId", "productIds"] as const
            ).find((f) => f === res.field);
            if (field) setErrors({ [field]: res.error });
            if ("partly" in res && res.partly) {
                // Its name, line or category saved; the list didn't.
                showError("The rest saved, but not its products.", res.error);
                router.refresh();
            } else if (!field) {
                showError("The collection wasn't saved.", res.error);
            }
            return;
        }
        done(
            editing
                ? `${values.name.trim()} saved.`
                : `${values.name.trim()} created.`,
        );
    }

    async function remove() {
        if (!collectionId) return;
        setAskDelete(false);
        const res = await removeCollection(collectionId);
        if (!res.ok) {
            showError("The collection wasn't deleted.", res.error);
            return;
        }
        done(`${before.name} deleted. Its products are as they were.`);
    }

    const title = !editing
        ? "New collection"
        : canWrite
          ? `Edit ${before.name || "collection"}`
          : before.name || "Collection";
    const web = websiteLine(detail?.website);

    return (
        <>
            <Sheet open={open} onOpenChange={requestClose}>
                <SheetContent
                    className="flex w-full flex-col gap-0 p-0 focus:outline-none sm:max-w-[460px]"
                    onOpenAutoFocus={(e) => {
                        e.preventDefault();
                        (e.currentTarget as HTMLElement | null)?.focus();
                    }}
                >
                    <SheetHeader className="space-y-0 border-b border-border py-3.5 pl-[18px] pr-14 text-left">
                        <p className="text-[11.5px] text-muted-foreground">
                            Collection
                        </p>
                        <SheetTitle className="font-display text-[18px] font-semibold tracking-[-0.02em]">
                            {title}
                        </SheetTitle>
                        <SheetDescription className="sr-only">
                            A collection groups products into a set people
                            browse.
                        </SheetDescription>
                    </SheetHeader>
                    <form
                        className="flex min-h-0 flex-1 flex-col"
                        onSubmit={(e) => {
                            e.preventDefault();
                            void save();
                        }}
                    >
                        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-[18px] pb-5 pt-4">
                            <SheetNotices
                                canWrite={canWrite}
                                loading={loading}
                                loadError={loadError}
                            />
                            {loading || loadError ? null : (
                                <>
                                    <NameField
                                        value={values.name}
                                        onChange={(v) => set("name", v)}
                                        disabled={readOnly}
                                        error={errors.name}
                                    />
                                    <DescriptionField
                                        value={values.description}
                                        onChange={(v) => set("description", v)}
                                        disabled={readOnly}
                                        error={errors.description}
                                    />

                                    <KindChoice
                                        value={values.kind}
                                        onChange={(k) => set("kind", k)}
                                        locked={editing}
                                        disabled={readOnly}
                                    />

                                    {values.kind === "AUTOMATIC" ? (
                                        <CategoryField
                                            categories={categories}
                                            value={values.categoryId}
                                            onChange={(v) =>
                                                set("categoryId", v)
                                            }
                                            disabled={readOnly}
                                            error={errors.categoryId}
                                        />
                                    ) : (
                                        <ProductsPicker
                                            picked={values.productIds}
                                            known={known}
                                            onKnow={(p) =>
                                                setKnown((m) =>
                                                    new Map(m).set(p.id, p),
                                                )
                                            }
                                            onChange={(next) =>
                                                set("productIds", next)
                                            }
                                            hiddenCount={
                                                detail?.hiddenCount ?? 0
                                            }
                                            disabled={readOnly}
                                            error={errors.productIds}
                                        />
                                    )}

                                    {web ? (
                                        <div className="space-y-1">
                                            <p className="text-[12.5px] font-medium">
                                                Shown on the website
                                            </p>
                                            <p className="text-[12px] text-muted-foreground">
                                                {web}
                                            </p>
                                        </div>
                                    ) : null}
                                </>
                            )}
                        </div>

                        {confirming ? (
                            <DiscardBar
                                onDiscard={() => {
                                    setConfirming(false);
                                    onOpenChange(false);
                                }}
                                onKeep={() => setConfirming(false)}
                            />
                        ) : null}
                        <SheetFooter className="flex flex-row flex-wrap items-center gap-2 border-t border-border px-[18px] py-3 sm:justify-start sm:space-x-0">
                            <span className="flex-[1_1_120px]">
                                {editing && canWrite && detail ? (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        className="h-[34px] rounded-[9px] px-2.5 text-[12.5px] font-semibold text-destructive hover:text-destructive"
                                        onClick={() => setAskDelete(true)}
                                        disabled={saving}
                                    >
                                        Delete
                                    </Button>
                                ) : null}
                            </span>
                            <Button
                                type="button"
                                variant="outline"
                                className="h-[34px] rounded-[9px] px-3 text-[12.5px] font-semibold"
                                onClick={() => requestClose(false)}
                                disabled={saving}
                            >
                                {canWrite ? "Cancel" : "Close"}
                            </Button>
                            {canWrite ? (
                                <Button
                                    type="submit"
                                    className="h-[34px] rounded-[9px] px-3.5 text-[12.5px] font-semibold"
                                    disabled={saving || readOnly || !dirty}
                                >
                                    {saving
                                        ? "Saving…"
                                        : editing
                                          ? "Save"
                                          : "Create collection"}
                                </Button>
                            ) : null}
                        </SheetFooter>
                    </form>
                </SheetContent>
            </Sheet>
            <ConfirmDialog
                open={askDelete && open}
                onOpenChange={(o) => {
                    if (!o) setAskDelete(false);
                }}
                title={`Delete “${before.name}”?`}
                description="The collection goes. Its products stay as they are, on sale where they were. This cannot be undone."
                confirmLabel="Delete collection"
                onConfirm={() => void remove()}
            />
        </>
    );
}
