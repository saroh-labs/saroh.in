"use client";

import { Input } from "@saroh/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@saroh/ui/select";

import type { CtaStyle, CtaValue } from "@/lib/sites/service";
import { CtaActionFields, actionOf } from "./cta-action-fields";
import { Field } from "./field";
import type { SectionFieldsProps } from "./props";

/**
 * The `cta` section's editor fields.
 *
 * Split out of `site-editor.tsx` (#260), which had grown to 2759 lines against
 * a repo standard of 400 — and which every new block type had to edit. Adding a
 * block is now adding a file.
 *
 * Moved verbatim: this is the same markup, in the same order, with the same
 * handlers. The refactor changes where the code lives and nothing about what it
 * does.
 */
export function CtaFields({
    section,
    pages,
    onChange,
}: SectionFieldsProps<"cta">) {
    const c = section.content;
    const patch = (next: Partial<CtaValue>) =>
        onChange({ ...section, content: { ...c, ...next } });
    return (
        <div className="grid gap-3">
            <Field label="Label">
                <Input
                    value={c.label}
                    onChange={(e) => patch({ label: e.target.value })}
                    placeholder="Start now"
                />
            </Field>
            <CtaActionFields
                action={actionOf(c)}
                pages={pages}
                onChange={(action) =>
                    onChange({
                        ...section,
                        contractVersion: 2,
                        content: { ...c, href: undefined, action },
                    })
                }
            />
            <Field label="Style">
                <Select
                    value={c.style ?? "primary"}
                    onValueChange={(v) => patch({ style: v as CtaStyle })}
                >
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="primary">Primary</SelectItem>
                        <SelectItem value="secondary">Secondary</SelectItem>
                        <SelectItem value="link">Link</SelectItem>
                    </SelectContent>
                </Select>
            </Field>
        </div>
    );
}
