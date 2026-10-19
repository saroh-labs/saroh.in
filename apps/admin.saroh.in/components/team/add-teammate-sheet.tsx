"use client";

import { Button } from "@saroh/ui/button";
import { DateInput } from "@saroh/ui/date-picker";
import { Field } from "@saroh/ui/field";
import { Input } from "@saroh/ui/input";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from "@saroh/ui/sheet";
import { Textarea } from "@saroh/ui/textarea";
import { showSuccess } from "@saroh/ui/toast";
import { useState, useTransition } from "react";

import type { AdminRole } from "@/lib/control-plane";
import { formatDate } from "@/lib/format";
import { addTeammateAction } from "@/lib/team-actions";
import type { StaffJob } from "@/lib/team-words";
import {
    JOB_LABEL,
    JOB_LINE,
    STAFF_JOBS,
    suggestedRole,
} from "@/lib/team-words";

import { endOfDay, RolePicker, todayIsoLocal } from "./team-actions";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Errors = Partial<
    Record<"name" | "email" | "roles" | "reason" | "form", string>
>;

/**
 * Add a teammate (admin console U17, R32), which replaces Grant access and
 * keeps everything it did: their email, their console roles (each with
 * what it is for), the day their access ends, and a reason on the audit
 * trail. It adds their name, what they work as and whether they are paid
 * by commission.
 *
 * The job suggests a role: Account manager for both sales jobs, Support
 * for anything else. The suggestion ticks itself until the operator ticks
 * roles by hand. Someone with a Saroh account gets access at once;
 * anyone else gets an invite email valid for 7 days
 * (`addTeammateAction`). One idempotency key per opening of the sheet.
 */
export function AddTeammateSheet({
    onOpenChange,
}: {
    onOpenChange: (open: boolean) => void;
}) {
    const [key] = useState(() => crypto.randomUUID());
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [job, setJob] = useState<StaffJob>("ACCOUNT_MANAGER_JOB");
    const [roles, setRoles] = useState<AdminRole[]>([
        suggestedRole("ACCOUNT_MANAGER_JOB"),
    ]);
    const [rolesTouched, setRolesTouched] = useState(false);
    const [onCommission, setOnCommission] = useState(true);
    const [endsOn, setEndsOn] = useState("");
    const [reason, setReason] = useState("");
    const [errors, setErrors] = useState<Errors>({});
    const [pending, startTransition] = useTransition();

    const suggested = suggestedRole(job);

    function pickJob(next: StaffJob) {
        setJob(next);
        if (!rolesTouched) setRoles([suggestedRole(next)]);
        if (next === "OTHER") setOnCommission(false);
    }

    function submit(event: React.FormEvent) {
        event.preventDefault();
        const found: Errors = {};
        if (!name.trim()) found.name = "Give their name.";
        if (!EMAIL.test(email.trim())) {
            found.email = "Give the email they'll sign in with.";
        }
        if (roles.length === 0) found.roles = "Tick at least one role.";
        if (reason.trim().length < 4) {
            found.reason = "Say why, in a few words.";
        }
        setErrors(found);
        if (Object.keys(found).length > 0) return;
        startTransition(async () => {
            const result = await addTeammateAction({
                name: name.trim(),
                email: email.trim(),
                worksAs: job,
                roles,
                onCommission,
                expiresAt: endOfDay(endsOn),
                reason: reason.trim(),
                idempotencyKey: key,
            });
            if (!result.ok) {
                setErrors({ form: result.error });
                return;
            }
            const who = name.trim();
            if (result.data.kind === "granted") {
                showSuccess(
                    `${who} is on the team.`,
                    "They can use the console from their next visit. Kept with your name in the audit trail.",
                );
            } else if (result.data.emailed) {
                showSuccess(
                    `Invite sent to ${email.trim()}.`,
                    `They join when they accept it, by ${formatDate(result.data.expiresAt)}.`,
                );
            } else {
                showSuccess(
                    `${who}'s invite is ready, but the email didn't go.`,
                    "Use Resend on their row in a minute.",
                );
            }
            onOpenChange(false);
        });
    }

    return (
        <Sheet open onOpenChange={onOpenChange}>
            <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
                <form
                    onSubmit={submit}
                    noValidate
                    className="flex flex-1 flex-col gap-4"
                >
                    <SheetHeader>
                        <SheetTitle>Add a teammate</SheetTitle>
                        <SheetDescription>
                            Someone with a Saroh account gets access now. Anyone
                            else gets an invite email that works for 7 days.
                        </SheetDescription>
                    </SheetHeader>
                    <Field label="Full name" error={errors.name}>
                        <Input
                            name="name"
                            autoComplete="off"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </Field>
                    <Field
                        label="Work email"
                        hint="They sign in with this."
                        error={errors.email}
                    >
                        <Input
                            name="email"
                            type="email"
                            autoComplete="off"
                            placeholder="first.last@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </Field>
                    <fieldset className="grid gap-2">
                        <legend className="mb-1 text-sm font-medium">
                            Works as
                        </legend>
                        {STAFF_JOBS.map((option) => (
                            <label
                                key={option}
                                className="flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-sm has-[:checked]:border-foreground coarse:min-h-11"
                            >
                                <input
                                    type="radio"
                                    name="worksAs"
                                    value={option}
                                    checked={job === option}
                                    onChange={() => pickJob(option)}
                                    className="mt-0.5 size-4 accent-foreground"
                                />
                                <span>
                                    <span className="font-medium">
                                        {JOB_LABEL[option]}
                                    </span>
                                    <span className="block text-[13px] text-muted-foreground">
                                        {JOB_LINE[option]}
                                    </span>
                                </span>
                            </label>
                        ))}
                    </fieldset>
                    <div className="grid gap-1.5">
                        <RolePicker
                            value={roles}
                            suggested={suggested}
                            onChange={(next) => {
                                setRolesTouched(true);
                                setRoles(next);
                            }}
                        />
                        {errors.roles ? (
                            <p
                                role="alert"
                                className="text-sm text-destructive"
                            >
                                {errors.roles}
                            </p>
                        ) : null}
                    </div>
                    <label className="flex items-start gap-2.5 text-sm coarse:min-h-11">
                        <input
                            type="checkbox"
                            name="onCommission"
                            checked={onCommission}
                            onChange={(e) => setOnCommission(e.target.checked)}
                            className="mt-0.5 size-4 accent-foreground"
                        />
                        <span>
                            <span className="font-medium">
                                Paid by commission
                            </span>
                            <span className="block text-[13px] text-muted-foreground">
                                They earn a share of what their businesses pay.
                                The rates are set in the console.
                            </span>
                        </span>
                    </label>
                    <Field
                        label="Access ends"
                        optional
                        hint="For someone who already has a Saroh account. An invite's access has no end date until you set one with Change."
                    >
                        <DateInput
                            name="expiresOn"
                            className="w-full"
                            min={todayIsoLocal()}
                            value={endsOn}
                            onValueChange={setEndsOn}
                            clearable
                            placeholder="No end date"
                        />
                    </Field>
                    <Field
                        label="Reason (kept in the audit trail)"
                        error={errors.reason}
                    >
                        <Textarea
                            name="reason"
                            rows={2}
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                        />
                    </Field>
                    {errors.form ? (
                        <p role="alert" className="text-sm text-destructive">
                            {errors.form}
                        </p>
                    ) : null}
                    <SheetFooter className="mt-auto gap-2">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => onOpenChange(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            busy={pending}
                            busyLabel="Adding…"
                        >
                            Add teammate
                        </Button>
                    </SheetFooter>
                </form>
            </SheetContent>
        </Sheet>
    );
}

/** The header's button and the sheet it opens, for `staff:grant`. */
export function AddTeammate() {
    const [open, setOpen] = useState(false);
    return (
        <>
            <Button type="button" onClick={() => setOpen(true)}>
                Add a teammate
            </Button>
            {open && <AddTeammateSheet onOpenChange={setOpen} />}
        </>
    );
}
