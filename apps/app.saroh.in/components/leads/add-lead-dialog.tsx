"use client";

import { Button } from "@saroh/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@saroh/ui/dialog";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { cn } from "@saroh/ui/lib/utils";
import { Textarea } from "@saroh/ui/textarea";
import { showError, showSuccess } from "@saroh/ui/toast";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { OptionSelect } from "@/components/shared/option-select";
import { createLead } from "@/lib/leads/actions";

export interface LeadContactOption {
    id: string;
    name: string;
    email: string;
}

/**
 * "Add a lead" — after the CRUD Flows design: one decision, so a dialog, and
 * it commits on Save.
 *
 * Someone who asked a question and did not buy is the most valuable list a
 * business keeps and the one it keeps worst, so the dialog asks for as little
 * as it can: who, and what they wanted. Who is someone you already know or
 * someone new; the API files a new person under their email (a second lead
 * for the same email joins the same person), which is why email is the one
 * thing a new person needs.
 */
export function AddLeadDialog({
    contacts,
    stages,
    stageId,
    label = "Add a lead",
    ariaLabel,
    variant = "default",
    size,
}: {
    contacts: LeadContactOption[];
    /** The pipeline's stages; the first is where a lead starts. */
    stages: { id: string; name: string }[];
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

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        const next: Record<string, string> = {};
        if (!title.trim()) next.title = "What did they want? A few words.";
        if (who === "new" && !/^\S+@\S+\.\S+$/.test(email.trim())) {
            next.email =
                "An email address, so the lead has someone to belong to.";
        }
        if (who === "known" && !contactId) next.contact = "Choose who it is.";
        if (worth.trim() && !/^\d+(\.\d{1,2})?$/.test(worth.trim())) {
            next.worth = "A number, like 45000 or 1250.50 — or leave it empty.";
        }
        setErrors(next);
        if (Object.keys(next).length > 0) return;

        const [firstName, ...rest] = name.trim().split(/\s+/);
        setSaving(true);
        const res = await createLead({
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
                          ...(rest.length ? { lastName: rest.join(" ") } : {}),
                          ...(phone.trim() ? { phone: phone.trim() } : {}),
                      },
                  }),
        });
        setSaving(false);
        if (!res.ok) {
            showError(res.error);
            return;
        }
        setOpen(false);
        reset();
        showSuccess(`${title.trim()} added to your leads`);
        router.push(`/leads/${res.data.id}`);
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(o) => {
                setOpen(o);
                if (!o) reset();
            }}
        >
            <DialogTrigger asChild>
                <Button variant={variant} size={size} aria-label={ariaLabel}>
                    <Plus className="mr-1.5 size-4" />
                    {label}
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[460px]">
                <form onSubmit={(e) => void submit(e)} className="space-y-4">
                    <DialogHeader>
                        <DialogTitle className="font-display text-[19px] tracking-[-0.025em]">
                            Add a lead
                        </DialogTitle>
                        <DialogDescription>
                            Who, and what they wanted. The rest is whatever you
                            happened to learn.
                        </DialogDescription>
                    </DialogHeader>

                    <fieldset className="grid gap-2">
                        <legend className="mb-2 text-[12.5px] font-medium">
                            Who are they?
                        </legend>
                        {contacts.length > 0 ? (
                            <div
                                role="radiogroup"
                                aria-label="Who are they?"
                                className="grid grid-cols-2 gap-[5px]"
                            >
                                {(
                                    [
                                        ["known", "Someone you know"],
                                        ["new", "Someone new"],
                                    ] as const
                                ).map(([key, text]) => (
                                    <label
                                        key={key}
                                        className={cn(
                                            "flex cursor-pointer items-center justify-center rounded-[9px] border px-3 py-2 text-[13px] transition-colors duration-fast has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                                            who === key
                                                ? "border-border-strong bg-foreground/[0.03] font-semibold"
                                                : "border-muted font-medium hover:border-border-strong",
                                        )}
                                    >
                                        <input
                                            type="radio"
                                            name="lead-who"
                                            className="sr-only"
                                            checked={who === key}
                                            onChange={() => setWho(key)}
                                        />
                                        {text}
                                    </label>
                                ))}
                            </div>
                        ) : null}
                        {who === "known" ? (
                            <div className="grid gap-1.5">
                                <Label
                                    htmlFor={ids.contact}
                                    className="sr-only"
                                >
                                    Contact
                                </Label>
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
                                <Note error={errors.contact} />
                            </div>
                        ) : (
                            <div className="grid gap-3">
                                <div className="grid gap-1.5">
                                    <Label htmlFor={ids.name}>Name</Label>
                                    <Input
                                        id={ids.name}
                                        value={name}
                                        placeholder="Meera Shah"
                                        autoComplete="off"
                                        onChange={(e) =>
                                            setName(e.target.value)
                                        }
                                    />
                                </div>
                                <div className="grid grid-cols-[3fr_2fr] gap-3">
                                    <div className="grid gap-1.5">
                                        <Label htmlFor={ids.email}>Email</Label>
                                        <Input
                                            id={ids.email}
                                            type="email"
                                            value={email}
                                            placeholder="meera@example.com"
                                            aria-invalid={Boolean(errors.email)}
                                            onChange={(e) =>
                                                setEmail(e.target.value)
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-1.5">
                                        <Label htmlFor={ids.phone}>
                                            Phone{" "}
                                            <span className="font-normal text-muted-foreground">
                                                optional
                                            </span>
                                        </Label>
                                        <Input
                                            id={ids.phone}
                                            type="tel"
                                            value={phone}
                                            onChange={(e) =>
                                                setPhone(e.target.value)
                                            }
                                        />
                                    </div>
                                </div>
                                <Note
                                    error={errors.email}
                                    note="Saroh will not mail them for you. Someone already in your contacts under this email is used, not copied."
                                />
                            </div>
                        )}
                    </fieldset>

                    <div className="grid gap-1.5">
                        <Label htmlFor={ids.title}>What did they want?</Label>
                        <Textarea
                            id={ids.title}
                            rows={2}
                            value={title}
                            maxLength={160}
                            placeholder="Asked about weekend classes"
                            aria-invalid={Boolean(errors.title)}
                            onChange={(e) => setTitle(e.target.value)}
                        />
                        <Note
                            error={errors.title}
                            note="The thing you will have forgotten in a fortnight. It is the lead's name in every list."
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="grid gap-1.5">
                            <Label htmlFor={ids.worth}>
                                Worth{" "}
                                <span className="font-normal text-muted-foreground">
                                    optional
                                </span>
                            </Label>
                            <Input
                                id={ids.worth}
                                inputMode="decimal"
                                value={worth}
                                placeholder="45000"
                                className="tabular-nums"
                                aria-invalid={Boolean(errors.worth)}
                                onChange={(e) => setWorth(e.target.value)}
                            />
                        </div>
                        {stages.length > 1 ? (
                            <div className="grid gap-1.5">
                                <Label htmlFor={ids.stage}>Stage</Label>
                                <OptionSelect
                                    id={ids.stage}
                                    value={stage}
                                    onValueChange={setStage}
                                    options={stages.map((s) => ({
                                        value: s.id,
                                        label: s.name,
                                    }))}
                                />
                            </div>
                        ) : null}
                    </div>
                    <Note error={errors.worth} />

                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={saving}>
                            {saving ? "Adding…" : "Add lead"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function Note({ note, error }: { note?: string; error?: string }) {
    if (!error && !note) return null;
    return (
        <p
            className={cn(
                "text-pretty text-[11.5px] leading-[1.5]",
                error ? "text-destructive" : "text-muted-foreground",
            )}
        >
            {error ?? note}
        </p>
    );
}
