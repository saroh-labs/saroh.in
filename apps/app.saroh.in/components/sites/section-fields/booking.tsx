"use client";

import Link from "next/link";

import { Input } from "@saroh/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@saroh/ui/select";
import { Textarea } from "@saroh/ui/textarea";

import type { BookingContent } from "@/lib/sites/service";
import { Field } from "./field";
import type { SectionFieldsProps } from "./props";

/**
 * The `booking` section's editor fields.
 *
 * Split out of `site-editor.tsx` (#260), which had grown to 2759 lines against
 * a repo standard of 400 — and which every new block type had to edit. Adding a
 * block is now adding a file.
 *
 * Moved verbatim: this is the same markup, in the same order, with the same
 * handlers. The refactor changes where the code lives and nothing about what it
 * does.
 */
export function BookingFields({
    section,
    services,
    onChange,
}: SectionFieldsProps<"booking">) {
    const c = section.content;
    const patch = (next: Partial<BookingContent>) =>
        onChange({ ...section, content: { ...c, ...next } });
    // Prefer active services, but keep a currently-selected archived one
    // visible so the author sees what's set.
    const options = services.filter(
        (s) => s.status === "ACTIVE" || s.id === c.serviceId,
    );
    const selectedMissing =
        c.serviceId !== undefined &&
        !services.some((s) => s.id === c.serviceId);
    return (
        <div className="grid gap-3">
            <Field label="Service">
                {services.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        No services yet.{" "}
                        <Link
                            href="/services/new"
                            className="underline hover:text-foreground"
                        >
                            Create a service
                        </Link>{" "}
                        first, then pick it here.
                    </p>
                ) : (
                    <Select
                        value={c.serviceId ?? ""}
                        onValueChange={(v) => patch({ serviceId: v })}
                    >
                        <SelectTrigger aria-label="Service">
                            <SelectValue placeholder="Choose a service" />
                        </SelectTrigger>
                        <SelectContent>
                            {options.map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                    {s.name}
                                    {s.status === "ARCHIVED"
                                        ? " (archived)"
                                        : ""}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
                {selectedMissing && (
                    <p className="text-xs text-muted-foreground">
                        The selected service is no longer available — choose
                        another.
                    </p>
                )}
            </Field>
            <Field label="Title">
                <Input
                    value={c.title ?? ""}
                    onChange={(e) => patch({ title: e.target.value })}
                    placeholder="Book a time"
                />
            </Field>
            <Field label="Description">
                <Textarea
                    value={c.description ?? ""}
                    onChange={(e) => patch({ description: e.target.value })}
                    rows={2}
                    placeholder="Pick a slot that suits you and we'll confirm by email."
                />
            </Field>
            <Field label="Submit button label">
                <Input
                    value={c.submitLabel ?? ""}
                    onChange={(e) => patch({ submitLabel: e.target.value })}
                    placeholder="Confirm booking"
                />
            </Field>
            <Field label="Success message">
                <Input
                    value={c.successMessage ?? ""}
                    onChange={(e) => patch({ successMessage: e.target.value })}
                    placeholder="You're booked — check your email."
                />
            </Field>
        </div>
    );
}
