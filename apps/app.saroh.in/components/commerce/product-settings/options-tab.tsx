"use client";

import { count } from "@/lib/format/plural";
import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { showError, showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import type { CatalogueView } from "@/lib/products/settings";
import { addOption, removeOption } from "@/lib/products/settings-actions";

import { runAction } from "@/lib/api/run-action";
import { TextLink } from "@saroh/ui/text-link";
import { ONE_OPTION_RULE, OptionSheet } from "./option-sheet";
import { SettingsReadOnly, TabIntro } from "./product-settings";

/** The Products list narrowed to the products choosing by one option. */
export function optionProductsHref(optionId: string): string {
    return `/commerce/products?option=${encodeURIComponent(optionId)}`;
}

/**
 * The ways customers choose between variants — Volume, Shade, Size — and
 * the values each offers, spelled one way for every product. Each option is
 * read first: New option and Edit open the one side sheet, where its name
 * and values are changed together and saved once. A product picks one
 * option, and the tab says so. Each card has one count line, a link to the
 * products choosing by it; Delete is offered only once none do.
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

    /** Not in use, so it asks nothing: gone at once, with Undo. */
    function remove(o: (typeof options)[number]) {
        run(async () => {
            const res = await removeOption(o.id);
            if (!res.ok) return showError(res.error);
            showUndo(`${o.name} deleted.`, () =>
                run(async () => {
                    const undo = await addOption(
                        res.data.name,
                        res.data.values,
                    );
                    if (!undo.ok) showError(undo.error);
                }),
            );
        });
    }

    const newOption = canWrite ? (
        <OptionSheet
            trigger={
                <Button type="button" className="shrink-0">
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
                {ONE_OPTION_RULE} Customers see “Shade: Rose nude”.
            </TabIntro>
            {canWrite ? null : <SettingsReadOnly />}

            {options.length === 0 ? (
                <EmptyState
                    size="panel"
                    title="No options yet"
                    description="Add one when a product comes in more than one kind, such as Size with 250 g and 500 g."
                    action={newOption}
                />
            ) : (
                <ul className="flex flex-col gap-3">
                    {options.map((o) => {
                        const used = o.productCount > 0;
                        return (
                            <li
                                key={o.id}
                                className="rounded-[12px] border border-border bg-card px-4 py-3.5"
                            >
                                <div className="flex flex-wrap items-center gap-2">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[14px] font-semibold [overflow-wrap:anywhere]">
                                            {o.name}
                                        </p>
                                        <p className="mt-0.5 text-[12px] text-muted-foreground">
                                            {used ? (
                                                <TextLink
                                                    href={optionProductsHref(
                                                        o.id,
                                                    )}
                                                    className="text-[12px]"
                                                    aria-label={`${count(o.productCount, "product")} choosing by ${o.name}`}
                                                >
                                                    {count(
                                                        o.productCount,
                                                        "product",
                                                    )}
                                                </TextLink>
                                            ) : (
                                                "Not on any product"
                                            )}
                                        </p>
                                    </div>
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
                                            {/* In use, Delete isn't offered: the count says why. */}
                                            {used ? null : (
                                                <Button
                                                    variant="outline"
                                                    size="xs"
                                                    type="button"
                                                    disabled={pending}
                                                    aria-label={`Delete ${o.name}`}
                                                    className="text-destructive"
                                                    onClick={() => remove(o)}
                                                >
                                                    Delete
                                                </Button>
                                            )}
                                        </div>
                                    ) : null}
                                </div>

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
