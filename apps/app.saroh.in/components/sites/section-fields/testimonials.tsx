"use client";

import { Input } from "@saroh/ui/input";
import { Textarea } from "@saroh/ui/textarea";

import type { TestimonialsContent } from "@/lib/sites/service";

import { Field } from "./field";
import type { SectionFieldsProps } from "./props";
import { RepeatedItems } from "./repeated-items";

/** The contract's cap, so "Add" stops where the save would start failing. */
const MAX_ITEMS = 12;

/** The `testimonials` section's editor fields (#255). */
export function TestimonialsFields({
    section,
    onChange,
}: SectionFieldsProps<"testimonials">) {
    const c = section.content;
    const patch = (next: Partial<TestimonialsContent>) =>
        onChange({ ...section, content: { ...c, ...next } });

    return (
        <div className="grid gap-3">
            <Field label="Heading">
                <Input
                    value={c.heading ?? ""}
                    onChange={(e) => patch({ heading: e.target.value })}
                    placeholder="What our customers say"
                />
            </Field>

            <RepeatedItems
                items={c.items}
                onChange={(items) => patch({ items })}
                max={MAX_ITEMS}
                itemNoun="Quote"
                addLabel="Add a quote"
                fullMessage="That is the most this block carries."
                newItem={() => ({ quote: "", name: "" })}
            >
                {(item, set) => (
                    <>
                        <Field label="Quote">
                            <Textarea
                                value={item.quote}
                                onChange={(e) => set({ quote: e.target.value })}
                                rows={3}
                                placeholder="In the customer's own words."
                            />
                        </Field>
                        <Field label="Name">
                            <Input
                                value={item.name}
                                onChange={(e) => set({ name: e.target.value })}
                                placeholder="Who said it — a quote needs a name"
                            />
                        </Field>
                        <Field label="Role or detail">
                            <Input
                                value={item.role ?? ""}
                                onChange={(e) => set({ role: e.target.value })}
                                placeholder="Customer since 2019. Optional."
                            />
                        </Field>
                    </>
                )}
            </RepeatedItems>
        </div>
    );
}
