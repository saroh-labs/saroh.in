"use client";

import { count } from "@/lib/format/plural";
import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { showError, showUndo } from "@saroh/ui/toast";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import type { CatalogueView } from "@/lib/products/settings";
import { addOption, removeOption } from "@/lib/products/settings-actions";

import { ReadOnlyNote } from "@/components/shared/read-only-note";
import { runAction } from "@/lib/api/run-action";
import { Tip } from "@saroh/ui/tooltip";
import { OptionSheet } from "./option-sheet";
import { TabIntro } from "./product-settings";

/**
 * The ways customers choose between variants — Volume, Shade, Size — and
 * the values each offers, spelled one way for every product. Each option is
 * read first: New option and Edit open the one side sheet, where its name
 * and values are changed together and saved once. A value a variant uses
 * can't go, and an option a product chooses by can't either; both say so
 * rather than failing.
 */
export function OptionsTab({ catalogue }: { catalogue: CatalogueView }) {
    const router = useRouter();
    const { options, canWrite } = catalogue;
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

    const newOption = canWrite ? (
        <OptionSheet
            trigger={
                <Button type="button" className="shrink-0">
                    <Plus aria-hidden className="-ml-0.5 mr-1.5 size-3.5" />
                    New option
                </Button>
            }
            options={options}
        />
    ) : null;

    return (
        <section>
            <TabIntro
                title="Options"
                // With none yet, the empty state carries the button.
                action={options.length > 0 ? newOption : null}
            >
                The names your variants use, and the values you pick from.
                Customers see the name: “Shade: Rose nude” rather than “Size”.
            </TabIntro>
            {canWrite ? null : <ReadOnlyNote />}

            {options.length === 0 ? (
                <EmptyState
                    size="panel"
                    title="No options yet"
                    description="Add one when a product comes in more than one kind, such as Size with 250g and 500g."
                    action={newOption}
                />
            ) : (
                <ul className="flex flex-col gap-3">
                    {options.map((o) => {
                        const used = o.productCount > 0;
                        const usedLine = `Used by ${count(o.productCount, "product")}. Change their variants first.`;
                        return (
                            <li
                                key={o.id}
                                className="rounded-[12px] border border-border bg-card px-4 py-3.5"
                            >
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="min-w-0 flex-1 text-[14px] font-semibold [overflow-wrap:anywhere]">
                                        {o.name}
                                    </span>
                                    <span className="text-[12px] text-muted-foreground">
                                        Used by{" "}
                                        {count(o.productCount, "product")}
                                    </span>
                                    {canWrite ? (
                                        <div className="flex shrink-0 gap-1.5">
                                            <OptionSheet
                                                trigger={
                                                    <Button
                                                        variant="outline"
                                                        size="xs"
                                                        type="button"
                                                        aria-label={`Edit ${o.name}`}
                                                    >
                                                        Edit
                                                    </Button>
                                                }
                                                option={o}
                                                options={options}
                                            />
                                            <Tip
                                                label={
                                                    used
                                                        ? usedLine
                                                        : `Delete ${o.name}`
                                                }
                                            >
                                                <Button
                                                    variant="outline"
                                                    size="xs"
                                                    type="button"
                                                    disabled={used || pending}
                                                    aria-label={`Delete ${o.name}`}
                                                    className={
                                                        used
                                                            ? undefined
                                                            : "text-destructive"
                                                    }
                                                    onClick={() =>
                                                        run(async () => {
                                                            const res =
                                                                await removeOption(
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
                                                </Button>
                                            </Tip>
                                        </div>
                                    ) : null}
                                </div>
                                {used && canWrite ? (
                                    <p className="mt-1 text-[11.5px] text-muted-foreground">
                                        {usedLine}
                                    </p>
                                ) : null}

                                {o.values.length === 0 ? (
                                    <EmptyState
                                        size="inline"
                                        className="mt-2.5"
                                        title="No values yet"
                                        description={
                                            canWrite
                                                ? "Edit it to add some."
                                                : undefined
                                        }
                                    />
                                ) : (
                                    <ul
                                        aria-label={`${o.name} values`}
                                        className="mt-2.5 flex flex-wrap gap-1.5"
                                    >
                                        {o.values.map((v) => (
                                            <li
                                                key={v.id}
                                                className="inline-flex h-7 items-center rounded-full border border-border px-2.5 text-[12.5px]"
                                            >
                                                {v.value}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}
