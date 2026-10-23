"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { runAction } from "@/lib/api/run-action";
import { addQuickStock } from "@/lib/products/list-actions";
import { readAdd } from "@/lib/products/quick-look";
import { addedWords } from "@/lib/stock/levels";

/**
 * "+N · Add" in a variant's drawer (Products audit, 16 Oct 2026): units
 * received onto its shelf at the page's storefront, the quick look's
 * act, so a sold-out one is restocked where it is shown. One idempotency
 * key per add, so a retry adds once. Add is never off: pressed with
 * nothing typed, it says what is missing.
 */
export function DrawerAddStock({
    productId,
    variantId,
    title,
    storeId,
    storeName,
}: {
    productId: string;
    variantId: string;
    title: string;
    storeId: string;
    /** Named when the product sells at more than one storefront. */
    storeName: string | null;
}) {
    const router = useRouter();
    const id = useId();
    const [draft, setDraft] = useState("");
    const [problem, setProblem] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [key, setKey] = useState(() => crypto.randomUUID());

    async function add() {
        if (saving) return;
        const units = readAdd(draft);
        if (units === null) {
            setProblem("Type how many came in.");
            return;
        }
        setProblem(null);
        const res = await runAction(
            () =>
                addQuickStock({
                    storeId,
                    productId,
                    variantId,
                    units,
                    idempotencyKey: key,
                }),
            { setBusy: setSaving },
        );
        if (!res) return;
        if (!res.ok) {
            showError("The stock didn't change.", res.error);
            return;
        }
        setDraft("");
        setKey(crypto.randomUUID());
        const what = storeName ? `${title} at ${storeName}` : title;
        showSuccess(addedWords(units, what, res.data.shelf.canSell));
        router.refresh();
    }

    return (
        <div className="mt-3">
            <Label
                htmlFor={id}
                data-ph-mask=""
                className="text-[12px] text-muted-foreground"
            >
                Add stock{storeName ? ` at ${storeName}` : ""}
            </Label>
            <div className="mt-1 flex items-center gap-2">
                <Input
                    id={id}
                    dense
                    type="text"
                    inputMode="numeric"
                    value={draft}
                    onChange={(e) => {
                        setDraft(e.target.value.replace(/[^0-9]/g, ""));
                        setProblem(null);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            void add();
                        }
                    }}
                    aria-invalid={problem ? true : undefined}
                    aria-describedby={problem ? `${id}-problem` : undefined}
                    placeholder="+0"
                    className="w-[72px] text-right"
                />
                <Button
                    size="sm"
                    type="button"
                    busy={saving}
                    busyLabel="Adding…"
                    onClick={() => void add()}
                    aria-label={`Add to ${title}`}
                >
                    Add
                </Button>
            </div>
            {problem ? (
                <p
                    id={`${id}-problem`}
                    role="alert"
                    className="mt-1 text-[12px] text-destructive-subtle-foreground"
                >
                    {problem}
                </p>
            ) : null}
        </div>
    );
}
