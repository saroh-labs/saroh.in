"use client";

import { ChoiceGroup } from "@/components/shared/choice-group";
import { FormSheet } from "@/components/shared/form-sheet";
import { runAction } from "@/lib/api/run-action";
import {
    setMemberExtraActions,
    updateMemberRole,
} from "@/lib/organizations/member-actions";
import type { OrganizationMember } from "@/lib/organizations/members";
import type { RolesLock } from "@/lib/organizations/roles-lock";
import { RoleDot } from "@saroh/ui/avatar";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { showError, showSuccess } from "@saroh/ui/toast";
import { Check, Info } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ExtraPermissions, useMemberExtras } from "./member-extras";
import type { RoleBook } from "./role-book";
import { nameOf } from "./role-book";

export function MemberDrawer({
    member,
    members,
    organizationName,
    book,
    canEditExtras,
    rolesLock,
    onClose,
    onRemove,
}: {
    member: OrganizationMember | null;
    members: OrganizationMember[];
    organizationName: string;
    book: RoleBook;
    /** Holds `member:role:update`, which also sets extras (F17). */
    canEditExtras: boolean;
    /** The plan leaves extras off (UX-030); null when it has them. */
    rolesLock: RolesLock | null;
    onClose: () => void;
    /** Hands an owner to the one Remove confirmation; see below. */
    onRemove: (member: OrganizationMember) => void;
}) {
    const router = useRouter();
    const [draft, setDraft] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const current = member ? (member.roleKey ?? member.role) : "MEMBER";
    const role = draft ?? current;
    const owners = members.filter(
        (m) => (m.roleKey ?? m.role) === "OWNER",
    ).length;
    // The workspace keeps an owner: the last one cannot be changed or removed.
    const lastOwner = current === "OWNER" && owners === 1;
    // Someone who can do more than the viewer, by role or by extras, cannot
    // be changed by them — the API refuses it, so the drawer says so instead
    // of offering the attempt.
    const outranks = !!member && !book.personWithinReach(member);
    const locked = lastOwner || outranks;
    const extras = useMemberExtras({
        extras: member?.extraActions,
        currentGrants: book.grantsOf(current),
        draftGrants: book.grantsOf(role),
        draftRoleLabel: book.labelOf(role),
        reviewer: role === "REVIEWER",
        isSelf: !!member?.isSelf,
        canEdit: canEditExtras,
        beyond: outranks,
        name: member ? nameOf(member) : "",
        catalogue: book.catalogue,
        myActions: book.myActions,
        planLocked: rolesLock?.line ?? null,
    });
    const roleChanged = !!member && role !== current;
    const changed = roleChanged || extras.changed;

    function close() {
        setDraft(null);
        extras.reset();
        onClose();
    }

    async function save() {
        if (!member) return;
        // A reviewer holds named sites; making someone one needs sites they
        // already have, or a fresh reviewer invitation.
        if (role === "REVIEWER" && member.siteIds.length === 0) {
            showError(
                "Invite them as a reviewer, with the sites they may review, before making them one.",
            );
            return;
        }
        const userId = member.userId;
        const siteIds = member.siteIds;
        const saved = await runAction(
            async () => {
                // The role first: the extras are judged against the role
                // they'll sit on top of.
                const res = roleChanged
                    ? await updateMemberRole(userId, {
                          role,
                          ...(role === "REVIEWER" ? { siteIds } : {}),
                      })
                    : null;
                const extrasRes =
                    (res === null || res.ok) && extras.changed
                        ? await setMemberExtraActions(userId, extras.chosen)
                        : null;
                return { res, extrasRes };
            },
            { setBusy: setSaving },
        );
        if (!saved) return;
        const { res, extrasRes } = saved;
        const failed = [res, extrasRes].find((r) => r && !r.ok);
        if (failed && !failed.ok) {
            showError(failed.error);
            // A role that saved before the extras were refused is still new.
            if (res?.ok) router.refresh();
            return;
        }
        showSuccess(
            roleChanged ? "Role saved." : "Permissions saved.",
            roleChanged
                ? `${nameOf(member)} is now ${book.labelOf(role)} in ${organizationName}.`
                : undefined,
        );
        close();
        router.refresh();
    }

    return (
        <FormSheet
            open={!!member}
            eyebrow={member?.email}
            title={member ? nameOf(member) : "Team member"}
            description={`Their role in ${organizationName}, and anything extra they may do. It applies as soon as you save.`}
            pending={saving}
            dirty={changed}
            saveOff={outranks}
            extra={
                /* Everyone else is removed from their row. An owner has no
                   Remove there, so this is the one way to remove a second
                   owner. The viewer leaves from their own row. */
                member && !locked && current === "OWNER" && !member.isSelf ? (
                    <Button
                        data-ph-mask=""
                        type="button"
                        variant="ghost"
                        className="text-destructive-subtle-foreground hover:text-destructive-subtle-foreground"
                        disabled={saving}
                        onClick={() => {
                            // A role picked and not saved must not follow
                            // the sheet to the next person it opens for.
                            setDraft(null);
                            onRemove(member);
                        }}
                    >
                        Remove from {organizationName}
                    </Button>
                ) : null
            }
            onClose={close}
            onSubmit={save}
        >
            {member ? (
                <>
                    <div>
                        <p className="label mb-2.5">
                            Role in {organizationName}
                        </p>
                        <ChoiceGroup
                            label="Role"
                            className="flex flex-col gap-[5px]"
                            value={role}
                            onChange={setDraft}
                            disabled={locked}
                            choices={book.all.map(({ key: r }) => {
                                const on = r === role;
                                const beyond = !book.withinReach(r);
                                return {
                                    value: r,
                                    disabled: beyond,
                                    label: (
                                        <>
                                            <RoleDot role={r} />
                                            <span className="min-w-0 flex-1">
                                                <span
                                                    className={cn(
                                                        "block text-[13px]",
                                                        on
                                                            ? "font-semibold"
                                                            : "font-medium",
                                                    )}
                                                >
                                                    {book.labelOf(r)}
                                                </span>
                                                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                                                    {beyond
                                                        ? "Can do more than you can"
                                                        : book.plainOf(r)}
                                                </span>
                                            </span>
                                            {on ? (
                                                <Check
                                                    aria-hidden
                                                    className="size-4 shrink-0"
                                                />
                                            ) : null}
                                        </>
                                    ),
                                };
                            })}
                            itemClassName={(on, choice) =>
                                cn(
                                    "flex items-center gap-[11px] rounded-[9px] border px-3 py-[9px] text-left coarse:min-h-11",
                                    on
                                        ? "border-border-strong bg-foreground/[0.03]"
                                        : cn(
                                              "border-muted",
                                              !choice.disabled &&
                                                  "hover:border-border-strong active:bg-accent-active",
                                          ),
                                )
                            }
                        />

                        <ExtraPermissions
                            roleLabel={book.labelOf(role)}
                            groups={extras.groups}
                            lockedReason={extras.lockedReason}
                            disabled={saving}
                            onToggle={extras.toggle}
                        />

                        <div className="mt-4 flex items-start gap-[9px] rounded-[9px] bg-foreground/[0.03] px-[13px] py-[11px]">
                            <Info
                                aria-hidden
                                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                            />
                            <p className="text-[12.5px] leading-[1.5] text-neutral-600 dark:text-muted-foreground">
                                {lastOwner
                                    ? `${organizationName} keeps at least one owner. Make someone else an owner before changing or removing this one.`
                                    : outranks
                                      ? `${nameOf(member)} can do more than you can here, so you cannot change their role or remove them.`
                                      : (extras.summary ??
                                        `${book.labelOf(role)}: ${book.blurbOf(role)}`)}
                            </p>
                        </div>
                    </div>
                </>
            ) : null}
        </FormSheet>
    );
}
