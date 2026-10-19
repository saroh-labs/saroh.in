"use client";

import { Badge } from "@saroh/ui/badge";
import { Checkbox } from "@saroh/ui/checkbox";
import { DateInput } from "@saroh/ui/date-picker";
import { Field } from "@saroh/ui/field";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { OptionSelect } from "@saroh/ui/option-select";
import { showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { OperatorDialog } from "@/components/operator-dialog";
import { ROLE_LABEL, ROLE_PURPOSE } from "@/lib/roles";
import type { ProfileSave } from "@/lib/team-member-actions";
import { saveMemberProfileAction } from "@/lib/team-member-actions";
import type { StaffEngagement, TeamMember } from "@/lib/team-member-words";
import {
    ENGAGEMENT_LABEL,
    ENGAGEMENTS,
    memberName,
    missingWords,
    profileRows,
} from "@/lib/team-member-words";
import type { StaffJob } from "@/lib/team-words";
import { JOB_LABEL, STAFF_JOBS } from "@/lib/team-words";

export interface Teammate {
    platformAdminId: string;
    name: string;
}

/**
 * The Profile tab (R33): every detail on file, each one missing marked so,
 * with how many are missing at the top. The tax id is a row only for
 * Platform owner and Billing (`team:pay`), and never shown whole. Edit
 * details… (`team:write`) is an `OperatorDialog` that saves them all with a
 * reason. Then their console access: each role and what it is for.
 */
export function MemberProfile({
    member,
    pay,
    canEdit,
    teammates,
}: {
    member: TeamMember;
    pay: boolean;
    canEdit: boolean;
    /** Who they may report to, for Edit details. */
    teammates: Teammate[];
}) {
    const rows = profileRows(member, pay);
    const missing = missingWords(rows);
    const name = memberName(member);

    return (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <section
                aria-labelledby="member-details"
                className="grid content-start gap-3 rounded-xl border bg-card p-4"
            >
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2
                            id="member-details"
                            className="text-[15px] font-semibold"
                        >
                            Details
                        </h2>
                        {missing ? (
                            <Badge variant="warning">{missing}</Badge>
                        ) : null}
                    </div>
                    {canEdit ? (
                        <EditDetails
                            member={member}
                            pay={pay}
                            teammates={teammates}
                        />
                    ) : null}
                </div>
                {!member.profile.exists ? (
                    <p className="text-sm text-muted-foreground">
                        Nothing is on file for {name} yet.
                    </p>
                ) : null}
                <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                    {rows.map((row) => (
                        <div
                            key={row.key}
                            data-row={row.key}
                            data-missing={row.value === null ? "" : undefined}
                            className="grid min-w-0 gap-0.5"
                        >
                            <dt className="text-[12.5px] text-muted-foreground">
                                {row.label}
                            </dt>
                            <dd className="min-w-0 break-words text-sm">
                                {row.value ?? (
                                    <span className="font-medium text-warning-subtle-foreground">
                                        Missing
                                    </span>
                                )}
                            </dd>
                            {row.hint ? (
                                <dd className="text-[12px] text-muted-foreground">
                                    {row.hint}
                                </dd>
                            ) : null}
                        </div>
                    ))}
                </dl>
            </section>

            <section
                aria-labelledby="member-access"
                className="grid content-start gap-3 rounded-xl border bg-card p-4"
            >
                <h2 id="member-access" className="text-[15px] font-semibold">
                    Console access
                </h2>
                {member.roles.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        No active role: they can't open any screen.
                    </p>
                ) : (
                    <ul className="grid gap-2">
                        {member.roles.map((role) => (
                            <li key={role.role} className="grid gap-0.5">
                                <span className="text-sm font-medium">
                                    {ROLE_LABEL[role.role]}
                                </span>
                                <span className="text-[13px] text-muted-foreground">
                                    {ROLE_PURPOSE[role.role]}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
                <p className="text-[13px] text-muted-foreground">
                    Change or revoke access from the Team list.
                </p>
            </section>
        </div>
    );
}

interface Draft {
    worksAs: StaffJob;
    workEmail: string;
    phone: string;
    city: string;
    languages: string;
    joinedOn: string;
    reportsTo: string;
    engagement: StaffEngagement | "";
    capacity: string;
    onCommission: boolean;
    emergencyContact: string;
    taxId: string;
}

function draftOf(member: TeamMember): Draft {
    const p = member.profile;
    return {
        worksAs: p.worksAs ?? "OTHER",
        workEmail: p.workEmail ?? "",
        phone: p.phone ?? "",
        city: p.city ?? "",
        languages: p.languages.join(", "),
        joinedOn: p.joinedOn ?? "",
        reportsTo: p.reportsToPlatformAdminId ?? "",
        engagement: p.engagement ?? "",
        capacity: p.capacity === null ? "" : String(p.capacity),
        onCommission: p.onCommission,
        emergencyContact: p.emergencyContact ?? "",
        taxId: "",
    };
}

const orNull = (value: string) => value.trim() || null;

/** The save the dialog sends, or what is wrong with the draft. */
export function profileSave(
    draft: Draft,
    pay: boolean,
): { ok: true; save: ProfileSave } | { ok: false; error: string } {
    const capacity = draft.capacity.trim();
    const cap = capacity === "" ? null : Number(capacity);
    if (cap !== null && (!Number.isInteger(cap) || cap < 1 || cap > 10_000)) {
        return {
            ok: false,
            error: "How many businesses they can look after: a whole number from 1.",
        };
    }
    const taxId = draft.taxId.trim();
    return {
        ok: true,
        save: {
            worksAs: draft.worksAs,
            workEmail: orNull(draft.workEmail),
            phone: orNull(draft.phone),
            city: orNull(draft.city),
            languages: draft.languages
                .split(",")
                .map((language) => language.trim())
                .filter(Boolean),
            joinedOn: orNull(draft.joinedOn),
            reportsToPlatformAdminId: orNull(draft.reportsTo),
            engagement: draft.engagement || null,
            capacity: cap,
            onCommission: draft.onCommission,
            emergencyContact: orNull(draft.emergencyContact),
            ...(pay && taxId ? { taxId } : {}),
        },
    };
}

function EditDetails({
    member,
    pay,
    teammates,
}: {
    member: TeamMember;
    pay: boolean;
    teammates: Teammate[];
}) {
    const id = useId();
    const router = useRouter();
    const [draft, setDraft] = useState<Draft>(() => draftOf(member));
    const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
        setDraft((current) => ({ ...current, [key]: value }));
    const name = memberName(member);
    const others = teammates.filter(
        (teammate) => teammate.platformAdminId !== member.platformAdminId,
    );

    return (
        <OperatorDialog
            trigger="Edit details…"
            title={`Edit ${name}'s details`}
            effect="Saves every detail below as you leave it: a field left empty is cleared. On the audit trail with your reason, never the details themselves."
            submitLabel="Save details"
            onOpenChange={(open) => {
                if (open) setDraft(draftOf(member));
            }}
            fields={
                <div className="grid gap-3">
                    <Field label="Works as" htmlFor={`${id}-job`}>
                        <OptionSelect<StaffJob>
                            id={`${id}-job`}
                            value={draft.worksAs}
                            onValueChange={(value) => set("worksAs", value)}
                            options={STAFF_JOBS.map((job) => ({
                                value: job,
                                label: JOB_LABEL[job],
                            }))}
                        />
                    </Field>
                    <Field label="Work email" optional>
                        <Input
                            type="email"
                            value={draft.workEmail}
                            onChange={(e) => set("workEmail", e.target.value)}
                        />
                    </Field>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field
                            label="Phone"
                            optional
                            hint="Only Saroh's team sees this; businesses see the name and work email."
                        >
                            <Input
                                inputMode="tel"
                                value={draft.phone}
                                onChange={(e) => set("phone", e.target.value)}
                            />
                        </Field>
                        <Field label="City" optional>
                            <Input
                                value={draft.city}
                                onChange={(e) => set("city", e.target.value)}
                            />
                        </Field>
                    </div>
                    <Field
                        label="Languages"
                        optional
                        hint="Separate them with commas."
                    >
                        <Input
                            value={draft.languages}
                            onChange={(e) => set("languages", e.target.value)}
                        />
                    </Field>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Joined" optional>
                            <DateInput
                                className="w-full"
                                value={draft.joinedOn}
                                onValueChange={(value) =>
                                    set("joinedOn", value)
                                }
                                clearable
                                placeholder="Not set"
                            />
                        </Field>
                        <Field label="Reports to" htmlFor={`${id}-reports`}>
                            <OptionSelect<string>
                                id={`${id}-reports`}
                                value={draft.reportsTo}
                                onValueChange={(value) =>
                                    set("reportsTo", value)
                                }
                                options={[
                                    { value: "", label: "Nobody" },
                                    ...others.map((teammate) => ({
                                        value: teammate.platformAdminId,
                                        label: teammate.name,
                                    })),
                                ]}
                            />
                        </Field>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Employment" htmlFor={`${id}-engagement`}>
                            <OptionSelect<StaffEngagement | "">
                                id={`${id}-engagement`}
                                value={draft.engagement}
                                onValueChange={(value) =>
                                    set("engagement", value)
                                }
                                options={[
                                    { value: "", label: "Not set" },
                                    ...ENGAGEMENTS.map((engagement) => ({
                                        value: engagement,
                                        label: ENGAGEMENT_LABEL[engagement],
                                    })),
                                ]}
                            />
                        </Field>
                        <Field
                            label="Can look after"
                            optional
                            hint="How many businesses at once."
                        >
                            <Input
                                inputMode="numeric"
                                value={draft.capacity}
                                onChange={(e) =>
                                    set("capacity", e.target.value)
                                }
                            />
                        </Field>
                    </div>
                    <div className="flex items-center gap-2">
                        <Checkbox
                            id={`${id}-commission`}
                            checked={draft.onCommission}
                            onCheckedChange={(checked) =>
                                set("onCommission", checked === true)
                            }
                        />
                        <Label htmlFor={`${id}-commission`}>
                            Paid by commission
                        </Label>
                    </div>
                    <Field
                        label="Emergency contact"
                        optional
                        hint="A name and a phone number."
                    >
                        <Input
                            value={draft.emergencyContact}
                            onChange={(e) =>
                                set("emergencyContact", e.target.value)
                            }
                        />
                    </Field>
                    {pay ? (
                        <Field
                            label="Tax id (PAN)"
                            optional
                            hint={
                                member.profile.taxIdSet
                                    ? "One is on file. Type a new one only to replace it."
                                    : "Only Platform owner and Billing see this."
                            }
                        >
                            <Input
                                autoComplete="off"
                                value={draft.taxId}
                                onChange={(e) => set("taxId", e.target.value)}
                            />
                        </Field>
                    ) : null}
                </div>
            }
            onSubmit={async ({ reason, idempotencyKey }) => {
                const built = profileSave(draft, pay);
                if (!built.ok) return { ok: false, error: built.error };
                const result = await saveMemberProfileAction({
                    platformAdminId: member.platformAdminId,
                    profile: built.save,
                    reason,
                    idempotencyKey,
                });
                if (!result.ok) return { ok: false, error: result.error };
                showSuccess(`${name}'s details saved`);
                router.refresh();
                return { ok: true };
            }}
        />
    );
}
