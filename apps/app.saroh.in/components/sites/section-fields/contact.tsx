"use client";

import { Input } from "@saroh/ui/input";
import { Textarea } from "@saroh/ui/textarea";

import type { ContactContent } from "@/lib/sites/service";

import { Field } from "./field";
import type { SectionFieldsProps } from "./props";

/**
 * The `contact` section's editor fields (#255).
 *
 * An emptied field is stored as absent, not "": the contract checks a phone
 * number or email only when one is there, and "" would fail those checks.
 */
export function ContactFields({
    section,
    onChange,
}: SectionFieldsProps<"contact">) {
    const c = section.content;
    const patch = (next: Partial<ContactContent>) =>
        onChange({ ...section, content: { ...c, ...next } });
    const set =
        (field: keyof ContactContent) =>
        (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
            patch({ [field]: e.target.value || undefined });

    const hasChannel = [c.address, c.phone, c.email, c.whatsapp].some(Boolean);

    return (
        <div className="grid gap-3">
            <Field label="Heading">
                <Input
                    value={c.heading ?? ""}
                    onChange={set("heading")}
                    placeholder="Visit or get in touch"
                />
            </Field>
            <Field label="Intro">
                <Textarea
                    value={c.intro ?? ""}
                    onChange={set("intro")}
                    rows={2}
                    placeholder="One line under the heading, if it needs one."
                />
            </Field>

            {hasChannel ? null : (
                <p className="text-sm text-muted-foreground">
                    Add at least one way to reach you: an address, phone, email
                    or WhatsApp number.
                </p>
            )}

            <Field label="Address">
                <Textarea
                    value={c.address ?? ""}
                    onChange={set("address")}
                    rows={3}
                    placeholder={"Unit 4, Riverside Trade Park\nLeeds LS10 1AB"}
                />
            </Field>
            <Field label="Opening hours">
                <Textarea
                    value={c.hours ?? ""}
                    onChange={set("hours")}
                    rows={3}
                    placeholder={"Mon–Fri 9:00–18:00\nSat 10:00–14:00"}
                />
            </Field>
            <Field label="Phone">
                <Input
                    type="tel"
                    value={c.phone ?? ""}
                    onChange={set("phone")}
                    placeholder="+91 98765 43210"
                />
            </Field>
            <Field label="Email">
                <Input
                    type="email"
                    value={c.email ?? ""}
                    onChange={set("email")}
                    placeholder="hello@yourbusiness.com"
                />
            </Field>
            <Field label="WhatsApp number">
                <Input
                    type="tel"
                    value={c.whatsapp ?? ""}
                    onChange={set("whatsapp")}
                    placeholder="With country code, e.g. +91 98765 43210"
                />
            </Field>
            <Field label="Map link">
                <Input
                    type="url"
                    value={c.mapUrl ?? ""}
                    onChange={set("mapUrl")}
                    placeholder="Optional. Otherwise the map searches for the address."
                />
            </Field>
        </div>
    );
}
