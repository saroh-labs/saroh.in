"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Textarea } from "@saroh/ui/textarea";

import type { FaqContent, FaqItem } from "@/lib/sites/service";

import { Field } from "./field";
import type { SectionFieldsProps } from "./props";

/** The contract's cap, so "Add" stops where the save would start failing. */
const MAX_ITEMS = 20;

/** The `faq` section's editor fields (#255). */
export function FaqFields({ section, onChange }: SectionFieldsProps<"faq">) {
    const c = section.content;
    const patch = (next: Partial<FaqContent>) =>
        onChange({ ...section, content: { ...c, ...next } });

    const setItem = (index: number, next: Partial<FaqItem>) =>
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

            {c.items.map((item, index) => (
                <div key={index} className="grid gap-2 rounded-md border p-3">
                    <div className="flex items-center justify-between">
                        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                            Question {index + 1}
                        </span>
                        {/* The contract needs at least one question. */}
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
                    <Field label="Question">
                        <Input
                            value={item.question}
                            onChange={(e) =>
                                setItem(index, { question: e.target.value })
                            }
                            placeholder="Do you deliver?"
                        />
                    </Field>
                    <Field label="Answer">
                        <Textarea
                            value={item.answer}
                            onChange={(e) =>
                                setItem(index, { answer: e.target.value })
                            }
                            rows={3}
                            placeholder="Line breaks are kept."
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
                        patch({
                            items: [...c.items, { question: "", answer: "" }],
                        })
                    }
                >
                    Add a question
                </Button>
            ) : (
                <p className="text-sm text-muted-foreground">
                    That is the most this block carries. Twenty questions is a
                    page of its own.
                </p>
            )}
        </div>
    );
}
