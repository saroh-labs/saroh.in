"use client";

import { Input } from "@saroh/ui/input";
import { Textarea } from "@saroh/ui/textarea";

import type { FeaturesContent } from "@/lib/sites/service";

import { Field } from "./field";
import type { SectionFieldsProps } from "./props";
import { RepeatedItems } from "./repeated-items";

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

            <RepeatedItems
                items={c.items}
                onChange={(items) => patch({ items })}
                max={MAX_ITEMS}
                itemNoun="Point"
                addLabel="Add a point"
                fullMessage="That is the most this block carries. More than twelve points is a page, not a summary."
                newItem={() => ({ title: "", body: "" })}
            >
                {(item, set) => (
                    <>
                        <Field label="Title">
                            <Input
                                value={item.title}
                                onChange={(e) => set({ title: e.target.value })}
                                placeholder="Stocked, not ordered in"
                            />
                        </Field>
                        <Field label="Detail">
                            <Textarea
                                value={item.body ?? ""}
                                onChange={(e) => set({ body: e.target.value })}
                                rows={3}
                                placeholder="A sentence or two. Optional."
                            />
                        </Field>
                    </>
                )}
            </RepeatedItems>
        </div>
    );
}
