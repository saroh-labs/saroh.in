"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@saroh/ui/select";
import { Textarea } from "@saroh/ui/textarea";

import type {
    EnquiryContent,
    EnquiryField,
    EnquiryFieldType,
} from "@/lib/sites/service";
import { ENQUIRY_FIELD_TYPES, FIELD_LABEL } from "./constants";
import { Field } from "./field";
import type { SectionFieldsProps } from "./props";

/**
 * The `enquiry` section's editor fields.
 *
 * Split out of `site-editor.tsx` (#260), which had grown to 2759 lines against
 * a repo standard of 400 — and which every new block type had to edit. Adding a
 * block is now adding a file.
 *
 * Moved verbatim: this is the same markup, in the same order, with the same
 * handlers. The refactor changes where the code lives and nothing about what it
 * does.
 */
export function EnquiryFields({
    section,
    onChange,
}: SectionFieldsProps<"enquiry">) {
    const c = section.content;
    const patch = (next: Partial<EnquiryContent>) =>
        onChange({ ...section, content: { ...c, ...next } });
    const setFields = (fields: EnquiryField[]) =>
        onChange({ ...section, content: { ...c, fields } });
    const patchField = (i: number, next: Partial<EnquiryField>) =>
        setFields(
            c.fields.map((f, idx) => (idx === i ? { ...f, ...next } : f)),
        );
    return (
        <div className="grid gap-3">
            <Field label="Title">
                <Input
                    value={c.title ?? ""}
                    onChange={(e) => patch({ title: e.target.value })}
                    placeholder="Get in touch"
                />
            </Field>
            <Field label="Description">
                <Textarea
                    value={c.description ?? ""}
                    onChange={(e) => patch({ description: e.target.value })}
                    rows={2}
                    placeholder="Tell us what you need and we'll reply."
                />
            </Field>
            <Field label="Submit button label">
                <Input
                    value={c.submitLabel ?? ""}
                    onChange={(e) => patch({ submitLabel: e.target.value })}
                    placeholder="Send"
                />
            </Field>
            <Field label="Success message">
                <Input
                    value={c.successMessage ?? ""}
                    onChange={(e) => patch({ successMessage: e.target.value })}
                    placeholder="Thanks — we'll be in touch soon."
                />
            </Field>
            <div className="grid gap-2">
                <Label className={FIELD_LABEL}>Fields</Label>
                <p className="text-xs text-muted-foreground">
                    Include at least one email field — it identifies the person
                    who enquired.
                </p>
                {c.fields.map((field, i) => (
                    <div key={i} className="grid gap-2 rounded-md border p-2">
                        <div className="flex items-start gap-2">
                            {/* The label is what the merchant names; the
                                key follows it until they set one under
                                Advanced (UX-081). */}
                            <Input
                                value={field.label}
                                onChange={(e) =>
                                    patchField(
                                        i,
                                        labelChange(field, e.target.value),
                                    )
                                }
                                placeholder="Label (Email)"
                                aria-label="Field label"
                            />
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                aria-label="Remove field"
                                onClick={() =>
                                    setFields(
                                        c.fields.filter((_, idx) => idx !== i),
                                    )
                                }
                            >
                                ✕
                            </Button>
                        </div>
                        <details className="text-xs">
                            <summary className="cursor-pointer text-muted-foreground">
                                Advanced
                            </summary>
                            <div className="mt-2 grid gap-1">
                                <Input
                                    value={field.name}
                                    onChange={(e) =>
                                        patchField(i, {
                                            name: e.target.value,
                                        })
                                    }
                                    placeholder="Field key (email)"
                                    aria-label="Field key"
                                />
                                <p className="text-muted-foreground">
                                    How this answer is stored. Keep{" "}
                                    <code>name</code>, <code>email</code>,{" "}
                                    <code>phone</code> or <code>message</code>{" "}
                                    so the lead shows it in the right place.
                                </p>
                            </div>
                        </details>
                        <div className="flex items-center gap-3">
                            <div className="w-40">
                                <Select
                                    value={field.type}
                                    onValueChange={(v) =>
                                        patchField(i, {
                                            type: v as EnquiryFieldType,
                                        })
                                    }
                                >
                                    <SelectTrigger aria-label="Field type">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {ENQUIRY_FIELD_TYPES.map((t) => (
                                            <SelectItem
                                                key={t.value}
                                                value={t.value}
                                            >
                                                {t.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <label className="flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    checked={field.required ?? false}
                                    onChange={(e) =>
                                        patchField(i, {
                                            required: e.target.checked,
                                        })
                                    }
                                />
                                Required
                            </label>
                        </div>
                    </div>
                ))}
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="justify-self-start"
                    onClick={() =>
                        setFields([
                            ...c.fields,
                            {
                                name: "",
                                label: "",
                                type: "text",
                            },
                        ])
                    }
                >
                    + Field
                </Button>
            </div>
        </div>
    );
}

/** The keys the API reads a lead's details by: never renamed for a label. */
const READ_KEYS: ReadonlySet<string> = new Set([
    "name",
    "email",
    "phone",
    "message",
]);

/** A label as a field key: lower-case words joined by underscores. */
export function keyFromLabel(label: string): string {
    return label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 64);
}

/**
 * A label edit (UX-081). The key follows the label while it is empty or
 * still the key the old label would have made; a key set by hand, or one
 * the API reads (`email` on an Email field), is left alone.
 */
export function labelChange(
    field: Pick<EnquiryField, "name" | "label">,
    label: string,
): Partial<EnquiryField> {
    const following =
        !READ_KEYS.has(field.name) &&
        (field.name === "" || field.name === keyFromLabel(field.label));
    return following ? { label, name: keyFromLabel(label) } : { label };
}
