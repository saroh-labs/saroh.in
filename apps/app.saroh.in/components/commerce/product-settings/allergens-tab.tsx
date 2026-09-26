"use client";

import { cn } from "@saroh/ui/lib/utils";
import { showError, showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { AllergenView } from "@/lib/products/settings";
import { addAllergens, removeAllergen } from "@/lib/products/settings-actions";

import { ReadOnlyNote } from "@/components/shared/read-only-note";
import {
    bigBtn,
    rowBtn,
    smallBtn,
    TabIntro,
    textBox,
} from "./product-settings";

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
 * the usual eight in one step. One a product lists can't be removed.
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
    const [name, setName] = useState("");
    const na = name.trim();
    const err =
        na && allergens.some((a) => a.name.toLowerCase() === na.toLowerCase())
            ? `${na} is already on the list.`
            : na.length > MAX
              ? `Keep it under ${MAX} characters.`
              : "";

    function run(work: () => Promise<void>) {
        start(async () => {
            await work();
            router.refresh();
        });
    }

    function add(names: string[], said: string) {
        run(async () => {
            const before = new Set(allergens.map((a) => a.id));
            const res = await addAllergens(names);
            if (!res.ok) return showError(res.error);
            setName("");
            const added = res.data.filter((a) => !before.has(a.id));
            showUndo(said, () =>
                run(async () => {
                    for (const a of added) await removeAllergen(a.id);
                }),
            );
        });
    }

    return (
        <section>
            <TabIntro title="Allergen list">
                What the editor offers under “Contains” and “May contain”.
                Customers see each one as you name it here.
            </TabIntro>
            {canWrite ? null : <ReadOnlyNote />}

            {allergens.length === 0 ? (
                <div className="flex flex-wrap items-center gap-3 rounded-[12px] border border-dashed border-border-strong px-4 py-3.5">
                    <p className="flex-[1_1_260px] text-pretty text-[12.5px] leading-[1.5] text-muted-foreground">
                        No allergens yet. A shop that sells food usually starts
                        with the common eight; anyone else can leave this empty.
                    </p>
                    {canWrite ? (
                        <button
                            type="button"
                            disabled={pending}
                            className={smallBtn}
                            onClick={() =>
                                add(
                                    COMMON,
                                    "The common food allergens are on the list.",
                                )
                            }
                        >
                            Add the common food allergens
                        </button>
                    ) : null}
                </div>
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

            {canWrite ? (
                <>
                    <form
                        className="mt-3.5 flex flex-wrap gap-2"
                        onSubmit={(e) => {
                            e.preventDefault();
                            if (!na || err) return;
                            add([na], `${na} added. The editor offers it now.`);
                        }}
                    >
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            aria-label="New allergen"
                            aria-invalid={!!err}
                            placeholder="Add one, e.g. Celery"
                            className={cn(
                                textBox,
                                "flex-[1_1_220px]",
                                err ? "border-destructive" : "border-border",
                            )}
                        />
                        <button
                            type="submit"
                            disabled={!na || !!err || pending}
                            className={bigBtn}
                        >
                            Add allergen
                        </button>
                    </form>
                    {err ? (
                        <p
                            role="alert"
                            className="mt-1.5 text-[12px] text-destructive"
                        >
                            {err}
                        </p>
                    ) : null}
                </>
            ) : null}
            <p className="mt-2 text-[11.5px] text-muted-foreground">
                One a product lists cannot be removed — take it off those
                products first.
            </p>
        </section>
    );
}
