"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Textarea } from "@saroh/ui/textarea";

import type { TestimonialItem, TestimonialsContent } from "@/lib/sites/service";

import { Field } from "./field";
import type { SectionFieldsProps } from "./props";

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

    const setItem = (index: number, next: Partial<TestimonialItem>) =>
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
                    placeholder="What our customers say"
                />
            </Field>

            {c.items.map((item, index) => (
                <div key={index} className="grid gap-2 rounded-md border p-3">
                    <div className="flex items-center justify-between">
                        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                            Quote {index + 1}
                        </span>
                        {/* The contract needs at least one quote. */}
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
                    <Field label="Quote">
                        <Textarea
                            value={item.quote}
                            onChange={(e) =>
                                setItem(index, { quote: e.target.value })
                            }
                            rows={3}
                            placeholder="In the customer's own words."
                        />
                    </Field>
                    <Field label="Name">
                        <Input
                            value={item.name}
                            onChange={(e) =>
                                setItem(index, { name: e.target.value })
                            }
                            placeholder="Who said it — a quote needs a name"
                        />
                    </Field>
                    <Field label="Role or detail">
                        <Input
                            value={item.role ?? ""}
                            onChange={(e) =>
                                setItem(index, { role: e.target.value })
                            }
                            placeholder="Customer since 2019. Optional."
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
                            items: [...c.items, { quote: "", name: "" }],
                        })
                    }
                >
                    Add a quote
                </Button>
            ) : (
                <p className="text-sm text-muted-foreground">
                    That is the most this block carries.
                </p>
            )}
        </div>
    );
}
