"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Textarea } from "@saroh/ui/textarea";

import type { FeatureItem, FeaturesContent } from "@/lib/sites/service";

import { Field } from "./field";
import type { SectionFieldsProps } from "./props";

/**
 * The `features` section's editor fields (#255).
 *
 * The block is a heading over a set of short, titled points. Its LOOK — grid or
 * list — is the picker the dispatcher renders above these fields, not something
 * chosen here: one place a look is chosen (#254).
 */

/**
 * The contract's cap, repeated here so the editor can stop offering "Add" at
 * the point the contract would start rejecting the save.
 *
 * #257 found every comparable product declares a bound on repeated content, and
 * `gallery` shipping without one is the gap this block does not repeat. Past
 * twelve the block stops being a summary and the merchant wants a page.
 */
const MAX_ITEMS = 12;

export function FeaturesFields({
    section,
    onChange,
}: SectionFieldsProps<"features">) {
    const c = section.content;
    const patch = (next: Partial<FeaturesContent>) =>
        onChange({ ...section, content: { ...c, ...next } });

    const setItem = (index: number, next: Partial<FeatureItem>) =>
        patch({
            items: c.items.map((item, i) =>
                i === index ? { ...item, ...next } : item,
            ),
        });

    return (
        <div className="grid gap-3">
            <Field label="Heading">
                <Input
                    value={c.heading ?? ""}
                    onChange={(e) => patch({ heading: e.target.value })}
                    placeholder="Why buy from us"
                />
            </Field>
            <Field label="Intro">
                <Textarea
                    value={c.intro ?? ""}
                    onChange={(e) => patch({ intro: e.target.value })}
                    rows={2}
                    placeholder="One line under the heading, if it needs one."
                />
            </Field>

            {c.items.map((item, index) => (
                <div key={index} className="grid gap-2 rounded-md border p-3">
                    <div className="flex items-center justify-between">
                        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                            Point {index + 1}
                        </span>
                        {/*
                         * The contract requires at least one point, so the last
                         * one cannot be removed — a section with none would
                         * save as invalid and the merchant would be told at
                         * publish rather than here.
                         */}
                        {c.items.length > 1 ? (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                    patch({
                                        items: c.items.filter(
                                            (_, i) => i !== index,
                                        ),
                                    })
                                }
                            >
                                Remove
                            </Button>
                        ) : null}
                    </div>
                    <Field label="Title">
                        <Input
                            value={item.title}
                            onChange={(e) =>
                                setItem(index, { title: e.target.value })
                            }
                            placeholder="Stocked, not ordered in"
                        />
                    </Field>
                    <Field label="Detail">
                        <Textarea
                            value={item.body ?? ""}
                            onChange={(e) =>
                                setItem(index, { body: e.target.value })
                            }
                            rows={3}
                            placeholder="A sentence or two. Optional."
                        />
                    </Field>
                </div>
            ))}

            {c.items.length < MAX_ITEMS ? (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                        patch({ items: [...c.items, { title: "", body: "" }] })
                    }
                >
                    Add a point
                </Button>
            ) : (
                <p className="text-[12px] text-muted-foreground">
                    That is the most this block carries. More than twelve points
                    is a page, not a summary.
                </p>
            )}
        </div>
    );
}
