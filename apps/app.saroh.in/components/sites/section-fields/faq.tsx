"use client";

import { Input } from "@saroh/ui/input";
import { Textarea } from "@saroh/ui/textarea";

import type { FaqContent } from "@/lib/sites/service";

import { Field } from "./field";
import type { SectionFieldsProps } from "./props";
import { RepeatedItems } from "./repeated-items";

/** The contract's cap, so "Add" stops where the save would start failing. */
const MAX_ITEMS = 20;

/** The `faq` section's editor fields (#255). */
export function FaqFields({ section, onChange }: SectionFieldsProps<"faq">) {
    const c = section.content;
    const patch = (next: Partial<FaqContent>) =>
        onChange({ ...section, content: { ...c, ...next } });

    return (
        <div className="grid gap-3">
            <Field label="Heading">
                <Input
                    value={c.heading ?? ""}
                    onChange={(e) => patch({ heading: e.target.value })}
                    placeholder="Questions we get asked"
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
                itemNoun="Question"
                addLabel="Add a question"
                fullMessage="That is the most this block carries. Twenty questions is a page of its own."
                newItem={() => ({ question: "", answer: "" })}
            >
                {(item, set) => (
                    <>
                        <Field label="Question">
                            <Input
                                value={item.question}
                                onChange={(e) =>
                                    set({ question: e.target.value })
                                }
                                placeholder="Do you deliver?"
                            />
                        </Field>
                        <Field label="Answer">
                            <Textarea
                                value={item.answer}
                                onChange={(e) =>
                                    set({ answer: e.target.value })
                                }
                                rows={3}
                                placeholder="Line breaks are kept."
                            />
                        </Field>
                    </>
                )}
            </RepeatedItems>
        </div>
    );
}
