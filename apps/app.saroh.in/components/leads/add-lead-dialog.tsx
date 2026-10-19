"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { MoneyInput } from "@saroh/ui/money-input";
import { Textarea } from "@saroh/ui/textarea";
import { showError, showSuccess } from "@saroh/ui/toast";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { BusinessPhoneInput } from "@/components/shared/business-phone-input";
import { FormSheet } from "@/components/shared/form-sheet";
import { runAction } from "@/lib/api/run-action";
import { createLead } from "@/lib/leads/actions";
import { phoneProblem } from "@/lib/organizations/business-phone";
import { Field } from "@saroh/ui/field";
import { OptionSelect } from "@saroh/ui/option-select";
import { Segmented } from "@saroh/ui/segmented";

export interface LeadContactOption {
    id: string;
    name: string;
    email: string;
}

/**
 * "Add a lead": a side sheet, committed on its button. Nobody is sent
 * away: the merchant stays on the list, and the toast has the way to the
 * new lead.
 *
 * Someone who asked a question and did not buy is the most valuable list a
 * business keeps and the one it keeps worst, so the sheet asks for as little
 * as it can: who, and what they wanted. Who is someone you already know or
 * someone new; the API files a new person under their email (a second lead
 * for the same email joins the same person), which is why email is the one
 * thing a new person needs.
 */
export function AddLeadDialog({
    contacts,
    stages,
    currency,
    stageId,
    label = "Add a lead",
    ariaLabel,
    variant = "default",
    size,
    header = false,
}: {
    /**
     * The page header's button: "New lead", with no icon, as every
     * header's primary is.
     */
    header?: boolean;
    contacts: LeadContactOption[];
    /** The pipeline's stages; the first is where a lead starts. */
    stages: { id: string; name: string }[];
    /** The business's currency: what a lead's Worth is in (owner, 11 Oct). */
    currency: string;
    /** Start in this stage — a column's own "+". */
    stageId?: string;
    label?: string;
    /** When the visible label leans on its surroundings: "Add" in a column. */
    ariaLabel?: string;
    variant?: "default" | "outline" | "ghost";
    size?: "default" | "sm";
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [who, setWho] = useState<"known" | "new">(
        contacts.length > 0 ? "known" : "new",
    );
    const [contactId, setContactId] = useState(contacts.at(0)?.id ?? "");
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [title, setTitle] = useState("");
    const [worth, setWorth] = useState("");
    const [stage, setStage] = useState(stageId ?? stages.at(0)?.id ?? "");
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const ids = {
        name: useId(),
        email: useId(),
        phone: useId(),
        title: useId(),
        worth: useId(),
        stage: useId(),
        contact: useId(),
    };

    function reset() {
        setName("");
        setEmail("");
        setPhone("");
        setTitle("");
        setWorth("");
        setErrors({});
        setStage(stageId ?? stages.at(0)?.id ?? "");
    }

    async function submit() {
        const next: Record<string, string> = {};
        if (!title.trim()) next.title = "What did they want? A few words.";
        if (who === "new" && !/^\S+@\S+\.\S+$/.test(email.trim())) {
            next.email =
                "An email address, so the lead has someone to belong to.";
        }
        if (who === "known" && !contactId) next.contact = "Choose who it is.";
        const phoneBad = who === "new" ? phoneProblem(phone) : null;
        if (phoneBad) next.phone = phoneBad;
        if (worth.trim() && !/^\d+(\.\d{1,2})?$/.test(worth.trim())) {
            next.worth = "A number, like 45000 or 1250.50, or leave it empty.";
        }
        setErrors(next);
        if (Object.keys(next).length > 0) return;

        const [firstName, ...rest] = name.trim().split(/\s+/);
        const res = await runAction(
            () =>
                createLead({
                    title: title.trim(),
                    ...(stage ? { stageId: stage } : {}),
                    ...(worth.trim()
                        ? { value: Math.round(Number(worth.trim()) * 100) }
                        : {}),
                    ...(who === "known"
                        ? { contactId }
                        : {
                              contact: {
                                  email: email.trim(),
                                  ...(firstName ? { firstName } : {}),
                                  ...(rest.length
                                      ? { lastName: rest.join(" ") }
                                      : {}),
                                  ...(phone.trim()
                                      ? { phone: phone.trim() }
                                      : {}),
                              },
                          }),
                }),
            { setBusy: setSaving },
        );
        if (!res) return;
        if (!res.ok) {
            showError(res.error);
            return;
        }
        const id = res.data.id;
        const what = title.trim();
        setOpen(false);
        reset();
        // They stay on the list, with the way to the new lead.
        showSuccess("Lead added.", what, {
            label: "Open lead",
            onClick: () => router.push(`/leads/${id}`),
        });
        router.refresh();
    }

    return (
        <FormSheet
            open={open}
            trigger={
                <Button variant={variant} size={size} aria-label={ariaLabel}>
                    {header ? null : <Plus className="mr-1.5 size-4" />}
                    {header ? "New lead" : label}
                </Button>
            }
            title="New lead"
            description="Who, and what they wanted. The rest is whatever you happened to learn."
            pending={saving}
            saveLabel="Add lead"
            savingLabel="Adding…"
            fieldsClassName="gap-4"
            onOpen={() => setOpen(true)}
            onClose={() => {
                setOpen(false);
                reset();
            }}
            onSubmit={submit}
        >
            <fieldset className="grid gap-2">
                <legend className="mb-2 text-[12.5px] font-medium">
                    Who are they?
                </legend>
                {contacts.length > 0 ? (
                    <Segmented
                        label="Who are they?"
                        block
                        size="md"
                        value={who}
                        onValueChange={setWho}
                        options={[
                            { value: "known", label: "Someone you know" },
                            { value: "new", label: "Someone new" },
                        ]}
                    />
                ) : null}
                {who === "known" ? (
                    <Field
                        label="Contact"
                        labelHidden
                        error={errors.contact}
                        className="space-y-0"
                    >
                        <OptionSelect
                            id={ids.contact}
                            value={contactId}
                            onValueChange={setContactId}
                            options={contacts.map((c) => ({
                                value: c.id,
                                label:
                                    c.name === c.email
                                        ? c.email
                                        : `${c.name} · ${c.email}`,
                            }))}
                        />
                    </Field>
                ) : (
                    <div className="grid gap-3">
                        <Field label="Name">
                            <Input
                                id={ids.name}
                                value={name}
                                placeholder="Meera Shah"
                                autoComplete="off"
                                onChange={(e) => setName(e.target.value)}
                            />
                        </Field>
                        <div className="grid gap-3">
                            <Field label="Email">
                                <Input
                                    id={ids.email}
                                    type="email"
                                    value={email}
                                    placeholder="meera@example.com"
                                    aria-invalid={Boolean(errors.email)}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </Field>
                            <Field label="Phone" optional error={errors.phone}>
                                <BusinessPhoneInput
                                    id={ids.phone}
                                    value={phone}
                                    onValueChange={setPhone}
                                />
                            </Field>
                        </div>
                        <Note
                            error={errors.email}
                            note="Saroh will not mail them for you. Someone already in your contacts under this email is used, not copied."
                        />
                    </div>
                )}
            </fieldset>

            <Field
                label="What did they want?"
                error={errors.title}
                hint="The thing you will have forgotten in a fortnight. It is the lead's name in every list."
            >
                <Textarea
                    id={ids.title}
                    rows={2}
                    value={title}
                    maxLength={160}
                    placeholder="Asked about weekend classes"
                    onChange={(e) => setTitle(e.target.value)}
                />
            </Field>

            <div className="grid grid-cols-2 items-start gap-3">
                <Field label="Worth" optional error={errors.worth}>
                    <MoneyInput
                        id={ids.worth}
                        currency={currency}
                        value={worth}
                        placeholder="45000"
                        onValueChange={setWorth}
                    />
                </Field>
                {stages.length > 1 ? (
                    <Field label="Stage">
                        <OptionSelect
                            id={ids.stage}
                            value={stage}
                            onValueChange={setStage}
                            options={stages.map((s) => ({
                                value: s.id,
                                label: s.name,
                            }))}
                        />
                    </Field>
                ) : null}
            </div>
        </FormSheet>
    );
}

function Note({ note, error }: { note?: string; error?: string }) {
    if (!error && !note) return null;
    return (
        <p
            role={error ? "alert" : undefined}
            className={cn(
                "text-pretty text-[11.5px] leading-[1.5]",
                error
                    ? "font-medium text-destructive-subtle-foreground"
                    : "text-muted-foreground",
            )}
        >
            {error ?? note}
        </p>
    );
}
