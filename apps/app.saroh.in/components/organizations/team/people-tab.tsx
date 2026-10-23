"use client";

import { PausedNote } from "@/components/billing/paused-banner";
import {
    ListTable,
    listTable,
    ListTableHead,
} from "@/components/shared/lists/list-toolbar";
import type { PausedTeam } from "@/lib/billing/paused";
import { pausedWords } from "@/lib/billing/paused";
import { count } from "@/lib/format/plural";
import { anyoneHasExtras, extraLabels } from "@/lib/organizations/extras";
import { isOnlyOwner, onlyOwnerLine } from "@/lib/organizations/leave-business";
import type {
    OrganizationInvitation,
    OrganizationMember,
} from "@/lib/organizations/members";
import { storefrontRolesLine } from "@/lib/organizations/storefront-team";
import {
    Avatar,
    AvatarFallback,
    avatarInitials,
    RoleDot,
    roleRingTone,
} from "@saroh/ui/avatar";
import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { useLocalPages } from "@saroh/ui/page-sizes";
import { Info } from "lucide-react";
import { LastActiveLine } from "./last-active-line";
import { LeaveBusiness } from "./leave-business";
import { ExtrasCell, ExtrasLine } from "./member-extras";
import { PendingInvites } from "./pending-invites";
import type { RoleBook } from "./role-book";
import { nameOf } from "./role-book";

export function PeopleTab({
    organizationName,
    members,
    invitations,
    canManage,
    book,
    onEdit,
    onRemove,
    notice,
    paused,
}: {
    organizationName: string;
    members: OrganizationMember[];
    invitations: OrganizationInvitation[];
    canManage: boolean;
    book: RoleBook;
    paused: PausedTeam;
    /** Absent for a viewer who can neither manage people nor change roles. */
    onEdit?: (member: OrganizationMember) => void;
    onRemove: (member: OrganizationMember) => void;
    /** The storefront-people notice (F16), above the roster. */
    notice?: React.ReactNode;
}) {
    // The design's columns need about 600px; the panel is that wide only
    // once the settings list sits beside it on a wide screen. Narrower, a
    // row is the person — role and extras under their name — and their
    // buttons. The Extra permissions column shows only once someone has
    // one (F15, F17): a column that says "—" for everyone says nothing.
    const withExtras = anyoneHasExtras(members);
    // The only owner can't leave: no button on their row, and why below.
    const onlyOwner = isOnlyOwner(members) === true;
    const grid = withExtras
        ? "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 xl:grid-cols-[minmax(170px,1.3fr)_112px_minmax(0,210px)_150px]"
        : "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 xl:grid-cols-[minmax(170px,1.3fr)_112px_150px]";
    const rowButton = "text-[12.5px]";
    // A page of people at a time, at the size this list was last shown at.
    const { rows: paged, paging } = useLocalPages("team", members, {
        label: "Pages of people",
    });

    return (
        <div className="space-y-3.5">
            {notice}

            {paused.userIds.length > 0 || paused.invitationIds.length > 0 ? (
                <PausedNote>{pausedWords("person")}</PausedNote>
            ) : null}

            {canManage && invitations.length > 0 ? (
                <PendingInvites
                    invitations={invitations}
                    book={book}
                    pausedIds={paused.invitationIds}
                />
            ) : null}

            <ListTable>
                <ListTableHead className={cn(grid, "hidden xl:grid")}>
                    <span>Person</span>
                    <span>Role</span>
                    {withExtras ? <span>Extra permissions</span> : null}
                    <span />
                </ListTableHead>
                <ul>
                    {paged.map((m) => {
                        const role = m.roleKey ?? m.role;
                        const extras = extraLabels(
                            m.extraActions ?? [],
                            book.catalogue,
                        );
                        // An owner is moved to another role first (Edit), and
                        // no one is removed by someone they outrank, by role
                        // or by extras. Leaving is not removing yourself: it
                        // is on your own row, whatever your role.
                        const canRemove =
                            canManage &&
                            role !== "OWNER" &&
                            !m.isSelf &&
                            book.personWithinReach(m);
                        return (
                            <li
                                key={m.userId}
                                className={cn(grid, listTable.row)}
                            >
                                <div className="flex min-w-0 items-center gap-[11px]">
                                    <Avatar
                                        size="row"
                                        ringTone={roleRingTone(role)}
                                    >
                                        <AvatarFallback>
                                            {avatarInitials(m.name, m.email)}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0">
                                        <p className="truncate text-[13.5px] font-medium">
                                            {nameOf(m)}
                                            {m.isSelf ? (
                                                <span className="font-normal text-muted-foreground">
                                                    {" "}
                                                    · you
                                                </span>
                                            ) : null}
                                            {paused.userIds.includes(
                                                m.userId,
                                            ) ? (
                                                <Badge
                                                    variant="warning"
                                                    className="ml-1.5 align-middle"
                                                >
                                                    Paused
                                                </Badge>
                                            ) : null}
                                        </p>
                                        <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
                                            {m.email}
                                            {m.role === "REVIEWER"
                                                ? ` · ${count(m.siteIds.length, "site")}`
                                                : ""}
                                        </p>
                                        {m.storefronts &&
                                        m.storefronts.length > 0 ? (
                                            <p className="mt-px truncate text-[11.5px] text-muted-foreground">
                                                {storefrontRolesLine(
                                                    m.storefronts,
                                                )}
                                            </p>
                                        ) : null}
                                        {/* The role, where there is no Role
                                            column to hold it. */}
                                        <p className="mt-px flex min-w-0 items-center gap-1.5 text-[11.5px] xl:hidden">
                                            <RoleDot role={role} size={9} />
                                            <span className="truncate">
                                                {book.labelOf(role)}
                                            </span>
                                        </p>
                                        <ExtrasLine labels={extras} />
                                        <LastActiveLine at={m.lastActiveAt} />
                                    </div>
                                </div>
                                <div className="hidden min-w-0 items-center gap-2 xl:flex">
                                    <RoleDot role={role} size={9} />
                                    <span className="truncate text-[13px]">
                                        {book.labelOf(role)}
                                    </span>
                                </div>
                                {withExtras ? (
                                    <div className="hidden min-w-0 xl:block">
                                        <ExtrasCell labels={extras} />
                                    </div>
                                ) : null}
                                <div className="flex flex-wrap justify-end gap-1.5">
                                    {m.isSelf && !onlyOwner ? (
                                        <LeaveBusiness
                                            business={organizationName}
                                            onlyOwner={false}
                                            locations={(
                                                m.storefronts ?? []
                                            ).map((s) => s.name)}
                                            size="sm"
                                            className={rowButton}
                                        />
                                    ) : null}
                                    {canRemove ? (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => onRemove(m)}
                                            aria-label={`Remove ${nameOf(m)} from ${organizationName}`}
                                            className={cn(
                                                rowButton,
                                                "text-destructive-subtle-foreground hover:text-destructive-subtle-foreground",
                                            )}
                                        >
                                            Remove
                                        </Button>
                                    ) : null}
                                    {onEdit ? (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => onEdit(m)}
                                            aria-label={`Edit ${nameOf(m)}’s role and permissions`}
                                            className={rowButton}
                                        >
                                            Edit
                                        </Button>
                                    ) : null}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            </ListTable>
            {paging}

            <div className="flex items-start gap-[9px] rounded-[10px] bg-foreground/[0.03] px-[15px] py-3">
                <Info
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                />
                <p className="text-[12.5px] leading-[1.5] text-neutral-600 dark:text-muted-foreground">
                    A person&apos;s role sets what they can reach in{" "}
                    {organizationName}. Leaving this business touches nothing in
                    any other.
                    {onlyOwner ? ` ${onlyOwnerLine(organizationName)}` : null}
                </p>
            </div>
        </div>
    );
}
