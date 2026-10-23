"use client";

import { showPlanRefusal } from "@/components/billing/plan-refusal";
import { CheckRow } from "@/components/shared/fields/check-row";
import { ChoiceGroup } from "@/components/shared/fields/choice-group";
import { FormSheet } from "@/components/shared/forms/form-sheet";
import { useHold } from "@/components/shared/undo/use-hold";
import type { DiaryPerson } from "@/lib/organizations/calendar-only";
import {
    CALENDAR_ONLY_ROLE,
    roleAfterDiaryPick,
} from "@/lib/organizations/calendar-only";
import type { InviteValues } from "@/lib/organizations/invitations";
import { inviteSchema } from "@/lib/organizations/invitations";
import { inviteMember } from "@/lib/organizations/member-actions";
import type {
    OrganizationInvitation,
    OrganizationMember,
} from "@/lib/organizations/members";
import { zodResolver } from "@hookform/resolvers/zod";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@saroh/ui/form";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { InviteDiaryPerson } from "./invite-diary-person";
import type { RoleBook } from "./role-book";

export interface ReviewableSite {
    id: string;
    name: string;
}

/**
 * "Invite to <business>" ("Saroh Settings" design): an email, a role picked
 * from a list that says what each one is for, Cancel and Send invite. A
 * side sheet, as inviting someone to a location is (`InvitePersonSheet`).
 *
 * An invite tells someone, so it waits ten seconds with Undo (`useHold`):
 * the sheet closes, keeping what was typed, and a refusal or an Undo
 * opens it again with that.
 *
 * Owner is not offered — the design invites people to run the day, and a
 * second owner is made from the Edit drawer once they have joined. Roles the
 * business invented are offered beside the built-ins; one that can do more
 * than the person inviting is shown and disabled, because the API refuses it.
 */
export function InviteSheet({
    open,
    onOpenChange,
    organizationName,
    sites,
    book,
    members,
    invitations,
    seatReason,
    diaryPeople,
    onSent,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    organizationName: string;
    sites: ReviewableSite[];
    book: RoleBook;
    members: OrganizationMember[];
    invitations: OrganizationInvitation[];
    /** The team is full (UX-028): only someone on the diary, and why. */
    seatReason: string | null;
    /** Who on the diary could be given a login (#868). */
    diaryPeople: DiaryPerson[];
    onSent: () => void;
}) {
    const router = useRouter();
    const schema = inviteSchema({
        memberEmails: members.map((m) => m.email),
        invitedEmails: invitations.map((i) => i.email),
    });
    const offered = book.all.filter((r) => r.key !== "OWNER");
    const startRole = "MEMBER";
    const form = useForm<InviteValues>({
        resolver: zodResolver(schema),
        defaultValues: {
            email: "",
            role: startRole,
            siteIds: [],
            staffId: "",
        },
        mode: "onTouched",
    });
    const sending = form.formState.isSubmitting;
    const { send } = useHold();
    const role = useWatch({ control: form.control, name: "role" });
    const staffId = useWatch({ control: form.control, name: "staffId" });
    // Why no role can be picked for want of room on the plan: every role
    // uses a seat (DEC-155). Someone already on the diary holds theirs, so
    // the invite adds nobody (#868).
    const noRoom = staffId ? null : seatReason;

    function pickDiaryPerson(next: string) {
        form.setValue("staffId", next);
        form.setValue(
            "role",
            roleAfterDiaryPick({
                staffId: next,
                current: form.getValues("role"),
                start: startRole,
                hasCalendarOnly: offered.some(
                    (r) => r.key === CALENDAR_ONLY_ROLE,
                ),
            }),
        );
    }

    const blank = () =>
        form.reset({
            email: "",
            role: startRole,
            siteIds: [],
            staffId: "",
        });

    function close() {
        blank();
        onOpenChange(false);
    }

    function submit(values: InviteValues) {
        const email = values.email.trim().toLowerCase();
        // What the API said, for when the sheet opens again.
        let onEmail: string | null = null;
        let planned = false;
        // Closed with what was typed kept: a refusal or an Undo needs it.
        onOpenChange(false);
        send(`invite:${email}`, {
            description: `${email} joins as ${book.labelOf(values.role)}.`,
            run: async () => {
                const res = await inviteMember({
                    email,
                    role: values.role,
                    ...(values.role === "REVIEWER"
                        ? { siteIds: values.siteIds }
                        : {}),
                    ...(values.staffId ? { staffId: values.staffId } : {}),
                });
                if (res.ok) return { ok: true };
                // The plan's team limit (U13): its notice, not a toast.
                if (res.plan) {
                    planned = true;
                    showPlanRefusal(res.plan);
                    return { ok: false, error: "", said: true };
                }
                // A refusal about the address ("already in this business")
                // goes on the field; anything else is a toast.
                if (res.field === "email") onEmail = res.error;
                return {
                    ok: false,
                    error: res.error,
                    said: res.field === "email",
                };
            },
            sent: `Sent to ${email}.`,
            onSent: () => {
                blank();
                onSent();
                router.refresh();
            },
            onBack: () => {
                if (planned) return blank();
                onOpenChange(true);
                if (onEmail) form.setError("email", { message: onEmail });
            },
        });
    }

    const errorText =
        "text-[12.5px] font-normal text-destructive-subtle-foreground";

    return (
        <Form {...form}>
            <FormSheet
                open={open}
                title={`Invite to ${organizationName}`}
                description="They get an email with a link. It adds them to this business only."
                pending={sending}
                saveLabel="Send invite"
                savingLabel="Sending…"
                fieldsClassName="gap-3.5"
                onClose={close}
                onSubmit={(e) => void form.handleSubmit(submit)(e)}
            >
                <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                        <FormItem className="space-y-1.5">
                            <FormLabel className="text-[12.5px] font-medium">
                                Email
                            </FormLabel>
                            <FormControl>
                                <Input
                                    type="email"
                                    autoComplete="off"
                                    placeholder="name@example.in"
                                    disabled={sending}
                                    className="aria-[invalid=true]:border-destructive-subtle-foreground"
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage role="alert" className={errorText} />
                        </FormItem>
                    )}
                />

                <InviteDiaryPerson
                    people={diaryPeople}
                    value={staffId ?? ""}
                    disabled={sending}
                    onPick={pickDiaryPerson}
                />

                <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                        <FormItem className="space-y-1.5">
                            <p
                                id="invite-role-label"
                                className="text-[12.5px] font-medium"
                            >
                                Role
                            </p>
                            {noRoom ? (
                                <p className="text-[12px] leading-[1.45] text-muted-foreground">
                                    {noRoom}
                                </p>
                            ) : null}
                            <ChoiceGroup
                                labelledBy="invite-role-label"
                                className="grid gap-1.5"
                                value={field.value}
                                onChange={field.onChange}
                                disabled={sending}
                                choices={offered.map((offer) => {
                                    const r = offer.key;
                                    // The API refuses to invite anyone
                                    // at a role that can do more than
                                    // the inviter.
                                    const beyond = !book.withinReach(r);
                                    // A full team takes no one new, at
                                    // any role.
                                    const full = noRoom;
                                    const off = beyond || full !== null;
                                    const checked = r === field.value;
                                    return {
                                        value: r,
                                        disabled: off,
                                        tip: beyond
                                            ? "Can do more than you can"
                                            : (full ?? undefined),
                                        label: (
                                            <>
                                                <span className="flex items-center justify-between gap-2 text-[13.5px] font-semibold">
                                                    {book.labelOf(r)}
                                                    {/* Which one is picked, beyond the border (UX-029). */}
                                                    {checked && !off ? (
                                                        <Check
                                                            aria-hidden
                                                            className="size-4 shrink-0"
                                                        />
                                                    ) : null}
                                                </span>
                                                <span className="mt-0.5 block text-[12px] text-muted-foreground">
                                                    {book.blurbOf(r)}
                                                </span>
                                            </>
                                        ),
                                    };
                                })}
                                itemClassName={(on, choice) =>
                                    cn(
                                        "block w-full rounded-[9px] border px-3 py-[9px] text-left coarse:min-h-11",
                                        choice.disabled
                                            ? "border-border opacity-50"
                                            : on
                                              ? "border-foreground bg-foreground/[0.03] shadow-[inset_0_0_0_1px_hsl(var(--foreground))]"
                                              : "border-border bg-card hover:border-border-strong",
                                    )
                                }
                            />
                        </FormItem>
                    )}
                />

                {role === "REVIEWER" ? (
                    <FormField
                        control={form.control}
                        name="siteIds"
                        render={({ field }) => (
                            <FormItem className="space-y-1.5">
                                <p className="text-[12.5px] font-medium">
                                    Websites they may review
                                </p>
                                {sites.length === 0 ? (
                                    <p className="text-[12.5px] text-muted-foreground">
                                        You have no websites yet. Make one
                                        first, then invite someone to review it.
                                    </p>
                                ) : (
                                    sites.map((site) => {
                                        const on = field.value.includes(
                                            site.id,
                                        );
                                        return (
                                            <CheckRow
                                                key={site.id}
                                                checked={on}
                                                disabled={sending}
                                                onChange={() =>
                                                    field.onChange(
                                                        on
                                                            ? field.value.filter(
                                                                  (s) =>
                                                                      s !==
                                                                      site.id,
                                                              )
                                                            : [
                                                                  ...field.value,
                                                                  site.id,
                                                              ],
                                                    )
                                                }
                                            >
                                                {site.name}
                                            </CheckRow>
                                        );
                                    })
                                )}
                                <FormMessage
                                    role="alert"
                                    className={errorText}
                                />
                            </FormItem>
                        )}
                    />
                ) : null}
            </FormSheet>
        </Form>
    );
}
