"use client";

import { PlanWay } from "@/components/billing/plan-way";
import { FailedRead } from "@/components/shared/failed-read";
import type { Role, RoleCatalogue } from "@/lib/organizations/roles";
import type { RolesLock } from "@/lib/organizations/roles-lock";
import { EmptyState } from "@saroh/ui/data-state";
import { TextLink } from "@saroh/ui/text-link";
import { Lock, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { NewRoleSheet } from "./new-role-sheet";
import { RoleDetail } from "./role-detail";
import { ListSection, RoleRow } from "./role-list";
import { viewerHolds } from "./role-reach";

/**
 * Team → Roles: the roles a business has, and the ones it invents.
 *
 * After the "Saroh Team Roles" design, which drew a second section of the
 * list as "Proposed · Stage 2" with the note "A custom role needs the server
 * policy to become data-driven. Until then these are designed, not
 * assignable." The policy is data-driven now, so that section is live: it
 * holds the roles this business made, and the owner ticks what each may do.
 *
 * The list the ticks come from is SERVED — the same catalogue `authorize()`
 * enforces — so the screen cannot offer a permission the server does not
 * check, and cannot miss one it does.
 *
 * Built-ins are shown with their ticks locked. They are the same in every
 * business, which is what lets "Admin" mean one thing to everyone who reads
 * it; a business wanting a different set makes a role of its own.
 *
 * Within reach (F19): the viewer can give a role only what they hold
 * themselves, so a permission they lack is locked with the reason beside it,
 * and a role that can already do more than them is shown read-only. The API
 * refuses both anyway; this is so nobody ticks a box only to be told no.
 */
export function RolesTab({
    roles,
    catalogue,
    canEdit,
    myActions,
    organizationName,
    builtInBlurb,
    builtInPlain,
    rolesLock = null,
}: {
    roles: Role[];
    catalogue: RoleCatalogue | null;
    /** Holds `member:role:update`. The API refuses writes without it anyway. */
    canEdit: boolean;
    /** What the viewer may do; `null` when unknown, and nothing is held back. */
    myActions: string[] | null;
    organizationName: string;
    /** What each built-in is for, in the words the People tab already uses. */
    builtInBlurb: Record<string, string>;
    /** The same in a few words, under each built-in's name in the list. */
    builtInPlain: Record<string, string>;
    /**
     * The plan leaves roles of your own off (UX-030): the way up stands
     * where New role would, rather than a sheet the API refuses.
     */
    rolesLock?: RolesLock | null;
}) {
    const [activeKey, setActiveKey] = useState<string>(
        roles.find((r) => !r.system)?.key ?? "MEMBER",
    );
    const [creating, setCreating] = useState(false);
    const holds = useMemo(() => viewerHolds(myActions), [myActions]);

    // `.at(0)` rather than `[0]`: an empty list is a real outcome — the roles
    // request failed — and it has to say so rather than render nothing.
    const active = roles.find((r) => r.key === activeKey) ?? roles.at(0);
    const builtIns = roles.filter((r) => r.system);
    const invented = roles.filter((r) => !r.system);

    if (!active) {
        return (
            <FailedRead
                size="panel"
                things="roles"
                reassurance="Nobody's access has changed."
            />
        );
    }

    return (
        <div className="flex flex-wrap items-start gap-5">
            {/* Sticks under the top bar, so switching roles never means
                scrolling back up past fifty-odd permissions to find the list. */}
            <div className="min-w-0 max-w-[300px] flex-[0_1_262px] self-start overflow-hidden rounded-xl border border-border lg:sticky lg:top-[77px]">
                <ListSection label="Roles">
                    {builtIns.map((role) => (
                        <RoleRow
                            key={role.key}
                            role={role}
                            plain={builtInPlain[role.key]}
                            on={role.key === active.key}
                            onPick={() => setActiveKey(role.key)}
                        />
                    ))}
                </ListSection>
                <ListSection label={`Made for ${organizationName}`}>
                    {invented.length === 0 ? (
                        <EmptyState
                            size="inline"
                            className="border-t border-border px-[15px] py-3"
                            title="No roles of your own yet"
                            description={
                                canEdit && !rolesLock
                                    ? "A role of your own grants exactly what you tick, and no more."
                                    : undefined
                            }
                        />
                    ) : (
                        invented.map((role) => (
                            <RoleRow
                                key={role.key}
                                role={role}
                                on={role.key === active.key}
                                onPick={() => setActiveKey(role.key)}
                            />
                        ))
                    )}
                </ListSection>
                {canEdit && rolesLock ? (
                    <div className="flex items-start gap-2 border-t border-border px-[15px] py-2.5 text-[12.5px] leading-[1.5] text-muted-foreground">
                        <Lock
                            aria-hidden
                            className="mt-0.5 size-3.5 shrink-0"
                        />
                        <p>
                            {rolesLock.line}{" "}
                            <PlanWay className="text-[length:inherit]">
                                <TextLink href={rolesLock.href}>
                                    {rolesLock.cta}
                                </TextLink>
                            </PlanWay>
                        </p>
                    </div>
                ) : canEdit ? (
                    <button
                        type="button"
                        onClick={() => setCreating(true)}
                        className="flex w-full items-center gap-2 border-t border-border px-[15px] py-2.5 text-left text-[13px] font-medium text-foreground transition-colors duration-fast hover:bg-foreground/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:bg-foreground/[0.07] coarse:min-h-11"
                    >
                        <Plus aria-hidden className="size-4" />
                        New role
                    </button>
                ) : null}
            </div>

            <RoleDetail
                // Remounts per role, so a half-edited draft never leaks from
                // one role into the next one clicked.
                key={active.key}
                role={active}
                catalogue={catalogue}
                canEdit={canEdit && !active.system}
                holds={holds}
                blurb={
                    active.system
                        ? (builtInBlurb[active.key] ?? "")
                        : "Made for this business. Whoever holds it can do exactly what is ticked below, and nothing more."
                }
                onRemoved={() => setActiveKey("MEMBER")}
            />

            {canEdit && !rolesLock ? (
                <NewRoleSheet
                    open={creating}
                    onOpenChange={setCreating}
                    roles={roles}
                    catalogue={catalogue}
                    holds={holds}
                    onCreated={(key) => setActiveKey(key)}
                />
            ) : null}
        </div>
    );
}
