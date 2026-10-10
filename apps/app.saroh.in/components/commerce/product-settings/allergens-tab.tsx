"use client";

import { EmptyState } from "@saroh/ui/data-state";
import { cn } from "@saroh/ui/lib/utils";
import { showError, showUndo } from "@saroh/ui/toast";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import type { AllergenView } from "@/lib/products/settings";
import { addAllergens, removeAllergen } from "@/lib/products/settings-actions";

import { ReadOnlyNote } from "@/components/shared/read-only-note";
import { NameDialog } from "./name-dialog";
import { bigBtn, rowBtn, smallBtn, TabIntro } from "./product-settings";

const MAX = 30;
const COMMON = [
    "Gluten",
    "Milk",
    "Eggs",
    "Nuts",
    "Peanuts",
    "Sesame",
    "Soy",
    "Mustard",
];

/**
 * What the editor offers under "Contains" and "May contain", named as
 * customers will read it. A store starts with none — a food business adds
 * the usual eight in one step. The list is read first: Add allergen opens a
 * one-field dialog. One a product lists can't be removed.
 */
export function AllergensTab({
    allergens,
    canWrite,
}: {
    allergens: AllergenView[];
    canWrite: boolean;
}) {
    const router = useRouter();
    const [pending, start] = useTransition();

    function run(work: () => Promise<void>) {
        start(async () => {
            await work();
            router.refresh();
        });
    }

    /** Resolves true when they were added. */
    async function add(names: string[], said: string) {
        const before = new Set(allergens.map((a) => a.id));
        const res = await addAllergens(names);
        if (!res.ok) {
            showError(res.error);
            return false;
        }
        router.refresh();
        const added = res.data.filter((a) => !before.has(a.id));
        showUndo(said, () =>
            run(async () => {
                for (const a of added) await removeAllergen(a.id);
            }),
        );
        return true;
    }

    const addOne = canWrite ? (
        <NameDialog
            trigger={
                <button type="button" className={bigBtn}>
                    <Plus aria-hidden className="-ml-0.5 mr-1.5 size-3.5" />
                    Add allergen
                </button>
            }
            title="Add allergen"
            note="Customers see it as you name it here."
            label="Allergen name"
            placeholder="Celery"
            submitLabel="Add allergen"
            busyLabel="Adding…"
            problem={(name) =>
                !name
                    ? "An allergen needs a name."
                    : allergens.some(
                            (a) => a.name.toLowerCase() === name.toLowerCase(),
                        )
                      ? `${name} is already on the list.`
                      : name.length > MAX
                        ? `Keep it under ${MAX} characters.`
                        : ""
            }
            onSubmit={(name) =>
                add([name], `${name} added. The editor offers it now.`)
            }
        />
    ) : null;

    return (
        <section>
            <TabIntro
                title="Allergen list"
                // With none yet, the empty state carries the buttons.
                action={allergens.length > 0 ? addOne : null}
            >
                What the editor offers under “Contains” and “May contain”.
                Customers see each one as you name it here.
            </TabIntro>
            {canWrite ? null : <ReadOnlyNote />}

            {allergens.length === 0 ? (
                <EmptyState
                    title="No allergens yet"
                    description="A shop that sells food usually starts with the common eight; anyone else can leave this empty."
                    action={
                        canWrite ? (
                            <div className="flex flex-wrap items-center justify-center gap-2">
                                <button
                                    type="button"
                                    disabled={pending}
                                    className={cn(smallBtn, "h-9 px-3.5")}
                                    onClick={() =>
                                        start(async () => {
                                            await add(
                                                COMMON,
                                                "The common food allergens are on the list.",
                                            );
                                        })
                                    }
                                >
                                    Add the common food allergens
                                </button>
                                {addOne}
                            </div>
                        ) : null
                    }
                />
            ) : (
                <ul className="rounded-[12px] border border-border bg-card">
                    {allergens.map((a) => {
                        const used = a.contains + a.mayContain;
                        const title = used
                            ? `${a.name} is on ${used} ${used === 1 ? "product" : "products"} — take it off them first`
                            : `Remove ${a.name}`;
                        return (
                            <li
                                key={a.id}
                                className="flex flex-wrap items-center gap-2.5 border-b border-border/70 px-4 py-[11px] last:border-b-0"
                            >
                                <span className="flex-[1_1_140px] text-[13.5px] font-semibold">
                                    {a.name}
                                </span>
                                <span className="flex-[2_1_220px] text-[12px] text-muted-foreground">
                                    {used
                                        ? [
                                              a.contains
                                                  ? `Contains: ${a.contains}`
                                                  : "",
                                              a.mayContain
                                                  ? `May contain: ${a.mayContain}`
                                                  : "",
                                          ]
                                              .filter(Boolean)
                                              .join(" · ")
                                        : "Not on any product yet"}
                                </span>
                                {canWrite ? (
                                    <button
                                        type="button"
                                        disabled={used > 0 || pending}
                                        title={title}
                                        aria-label={title}
                                        className={cn(
                                            rowBtn,
                                            used === 0 && "text-destructive",
                                        )}
                                        onClick={() =>
                                            run(async () => {
                                                const res =
                                                    await removeAllergen(a.id);
                                                if (!res.ok)
                                                    return showError(res.error);
                                                showUndo(
                                                    `${a.name} removed from the list.`,
                                                    () =>
                                                        run(async () => {
                                                            const undo =
                                                                await addAllergens(
                                                                    [a.name],
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
                                        Remove
                                    </button>
                                ) : null}
                            </li>
                        );
                    })}
                </ul>
            )}

            <p className="mt-2 text-[11.5px] text-muted-foreground">
                One a product lists cannot be removed — take it off those
                products first.
            </p>
        </section>
    );
}
