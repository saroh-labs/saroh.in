"use client";

import { RoleDot } from "@saroh/ui/avatar";
import { Button } from "@saroh/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@saroh/ui/dialog";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { cn } from "@saroh/ui/lib/utils";
import { Switch } from "@saroh/ui/switch";
import { showError, showSuccess } from "@saroh/ui/toast";
import { Info, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
    createRole,
    deleteRole,
    updateRole,
} from "@/lib/organizations/role-actions";
import type {
    Capability,
    Role,
    RoleCatalogue,
} from "@/lib/organizations/roles";

/** What a catalogue group is called on screen. */
const GROUP_LABEL: Record<string, string> = {
    business: "Business",
    team: "Team",
    sell: "Sell",
    website: "Website",
    contacts: "Contacts",
    schedule: "Schedule",
    money: "Money",
    messaging: "Messaging",
    insights: "Insights",
};

/** The built-ins a new role may start from. Owner is not offered: see below. */
const START_FROM = [
    { key: "", label: "Nothing — I will tick what it needs" },
    {
        key: "MEMBER",
        label: "Member — runs the day · can see settings, can't change them or see money",
    },
    { key: "ADMIN", label: "Admin — everything except removing an owner" },
    { key: "REVIEWER", label: "Reviewer — look at websites and sign them off" },
] as const;

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
 */
export function RolesTab({
    roles,
    catalogue,
    canEdit,
    organizationName,
    builtInBlurb,
    builtInPlain,
}: {
    roles: Role[];
    catalogue: RoleCatalogue | null;
    /** Holds `member:role:update`. The API refuses writes without it anyway. */
    canEdit: boolean;
    organizationName: string;
    /** What each built-in is for, in the words the People tab already uses. */
    builtInBlurb: Record<string, string>;
    /** The same in a few words, under each built-in's name in the list. */
    builtInPlain: Record<string, string>;
}) {
    const [activeKey, setActiveKey] = useState<string>(
        roles.find((r) => !r.system)?.key ?? "MEMBER",
    );
    const [creating, setCreating] = useState(false);

    // `.at(0)` rather than `[0]`: an empty list is a real outcome — the roles
    // request failed — and it has to say so rather than render nothing.
    const active = roles.find((r) => r.key === activeKey) ?? roles.at(0);
    const builtIns = roles.filter((r) => r.system);
    const invented = roles.filter((r) => !r.system);

    if (!active) {
        return (
            <p className="rounded-xl border border-border px-4 py-6 text-[13px] text-muted-foreground">
                The roles could not be loaded. Reload to try again —
                nobody&apos;s access has changed.
            </p>
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
                        <p className="border-t border-border px-[15px] py-3 text-[12px] leading-[1.5] text-muted-foreground">
                            {canEdit
                                ? "None yet. A role of your own grants exactly what you tick — no more."
                                : "None yet."}
                        </p>
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
                {canEdit ? (
                    <button
                        type="button"
                        onClick={() => setCreating(true)}
                        className="flex w-full items-center gap-2 border-t border-border px-[15px] py-2.5 text-left text-[13px] font-medium text-foreground transition-colors duration-fast hover:bg-foreground/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring coarse:min-h-11"
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
                blurb={
                    active.system
                        ? (builtInBlurb[active.key] ?? "")
                        : "Made for this business. Whoever holds it can do exactly what is ticked below, and nothing more."
                }
                onRemoved={() => setActiveKey("MEMBER")}
            />

            {canEdit ? (
                <NewRoleDialog
                    open={creating}
                    onOpenChange={setCreating}
                    roles={roles}
                    catalogue={catalogue}
                    onCreated={(key) => setActiveKey(key)}
                />
            ) : null}
        </div>
    );
}

function ListSection({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div className="border-b border-border last:border-b-0">
            <p className="px-[15px] py-[11px] text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                {label}
            </p>
            {children}
        </div>
    );
}

/**
 * A role in the list: its name, and under it who holds it and what it opens
 * — a built-in's in words ("can open everything"), a made role's as its count
 * of permissions, since its ticks are the business's own.
 */
function RoleRow({
    role,
    plain,
    on,
    onPick,
}: {
    role: Role;
    plain?: string;
    on: boolean;
    onPick: () => void;
}) {
    const people = role.members === 1 ? "1 person" : `${role.members} people`;
    return (
        <button
            type="button"
            aria-pressed={on}
            onClick={onPick}
            className={cn(
                "flex w-full items-center gap-[11px] border-t border-border px-[15px] py-2.5 text-left transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                on
                    ? "bg-brand-subtle shadow-[inset_2px_0_0_hsl(var(--highlight))]"
                    : "hover:bg-foreground/[0.035]",
            )}
        >
            <RoleDot role={role.key} />
            <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium">
                    {role.label}
                </span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    {people} ·{" "}
                    {plain ??
                        (role.actions.length === 1
                            ? "1 permission"
                            : `${role.actions.length} permissions`)}
                </span>
            </span>
        </button>
    );
}

/**
 * One role, and what it may do.
 *
 * The draft lives here and only here: the tab remounts this per role, so
 * switching roles mid-edit discards the draft rather than carrying ticks from
 * one role onto another. That is also why "Undo" is enough — there is never
 * more than one role's worth of unsaved change on screen.
 */
function RoleDetail({
    role,
    catalogue,
    canEdit,
    blurb,
    onRemoved,
}: {
    role: Role;
    catalogue: RoleCatalogue | null;
    canEdit: boolean;
    blurb: string;
    onRemoved: () => void;
}) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [label, setLabel] = useState(role.label);
    const [granted, setGranted] = useState<ReadonlySet<string>>(
        () => new Set(role.actions),
    );
    const [confirmRemove, setConfirmRemove] = useState(false);

    const saved = useMemo(() => new Set(role.actions), [role.actions]);
    const labelChanged = label.trim() !== role.label;
    const actionsChanged =
        granted.size !== saved.size ||
        Array.from(granted).some((a) => !saved.has(a));
    const dirty = canEdit && (labelChanged || actionsChanged);

    const byGroup = useMemo(() => {
        const groups = new Map<string, Capability[]>();
        for (const c of catalogue?.capabilities ?? []) {
            const list = groups.get(c.group) ?? [];
            list.push(c);
            groups.set(c.group, list);
        }
        return (catalogue?.groups ?? []).flatMap((g) => {
            const capabilities = groups.get(g);
            return capabilities ? [{ group: g, capabilities }] : [];
        });
    }, [catalogue]);

    const toggle = (action: string, on: boolean) =>
        setGranted((prev) => {
            const next = new Set(prev);
            if (on) next.add(action);
            else next.delete(action);
            return next;
        });

    const save = () =>
        startTransition(async () => {
            const res = await updateRole(role.key, {
                ...(labelChanged ? { label: label.trim() } : {}),
                ...(actionsChanged ? { actions: Array.from(granted) } : {}),
            });
            if (!res.ok) {
                showError(res.error);
                return;
            }
            showSuccess(`${res.data.label} saved`);
            router.refresh();
        });

    const remove = () =>
        startTransition(async () => {
            const res = await deleteRole(role.key);
            if (!res.ok) {
                showError(res.error);
                return;
            }
            showSuccess(`${role.label} removed`);
            setConfirmRemove(false);
            onRemoved();
            router.refresh();
        });

    const held = role.members;

    return (
        /* `overflow-clip`, not `overflow-hidden`: both clip the rounded
           corners, but `hidden` also makes this a scroll container, and a
           sticky footer inside a scroll container sticks to IT — which never
           scrolls — so the save bar would sit at the very end of the list. */
        <div className="min-w-0 flex-[1_1_420px] overflow-clip rounded-xl border border-border">
            <div className="border-b border-muted px-4 py-3.5">
                <div className="flex flex-wrap items-center gap-[11px]">
                    <RoleDot role={role.key} size={13} />
                    <h2 className="font-display text-[18px] font-semibold tracking-[-0.025em]">
                        {role.label}
                    </h2>
                    {role.system ? null : (
                        <span className="ml-auto rounded-full bg-muted px-[9px] py-[3px] text-[11px] font-medium text-neutral-600 dark:text-muted-foreground">
                            {held === 0
                                ? "Nobody holds it yet"
                                : held === 1
                                  ? "1 person holds it"
                                  : `${held} people hold it`}
                        </span>
                    )}
                </div>
                <p className="mt-[9px] text-[12.5px] leading-[1.55] text-neutral-600 dark:text-muted-foreground">
                    {blurb}
                </p>
                {canEdit ? (
                    <div className="mt-3 grid max-w-[340px] gap-1.5">
                        <Label htmlFor={`role-name-${role.key}`}>Name</Label>
                        <Input
                            id={`role-name-${role.key}`}
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            maxLength={40}
                            disabled={pending}
                        />
                    </div>
                ) : null}
            </div>

            {catalogue === null ? (
                <p className="px-4 py-6 text-[12.5px] text-muted-foreground">
                    The list of permissions could not be loaded. Reload to try
                    again — nothing about this role has changed.
                </p>
            ) : (
                <div className="px-4 pb-3.5 pt-1.5">
                    {byGroup.map(({ group, capabilities }) => {
                        const on = capabilities.filter((c) =>
                            granted.has(c.action),
                        ).length;
                        return (
                            <section key={group} className="pt-3">
                                <div className="flex items-baseline justify-between pb-1.5">
                                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                                        {GROUP_LABEL[group] ?? group}
                                    </h3>
                                    <span className="text-[11px] tabular-nums text-muted-foreground">
                                        {on} of {capabilities.length}
                                    </span>
                                </div>
                                {capabilities.map((c) => {
                                    const checked = granted.has(c.action);
                                    const id = `perm-${role.key}-${c.action}`;
                                    return (
                                        <div
                                            key={c.action}
                                            className="flex items-center gap-3 border-t border-border py-[9px]"
                                        >
                                            <label
                                                htmlFor={id}
                                                className="min-w-0 flex-1"
                                            >
                                                <span className="block text-[13px]">
                                                    {c.label}
                                                </span>
                                                {c.note ? (
                                                    <span className="mt-0.5 block text-[11px] leading-[1.45] text-muted-foreground">
                                                        {c.note}
                                                    </span>
                                                ) : null}
                                            </label>
                                            <Switch
                                                id={id}
                                                checked={checked}
                                                disabled={!canEdit || pending}
                                                onCheckedChange={(v) =>
                                                    toggle(c.action, v)
                                                }
                                                aria-label={`${c.label}, ${checked ? "allowed" : "not allowed"}`}
                                            />
                                        </div>
                                    );
                                })}
                            </section>
                        );
                    })}
                </div>
            )}

            {/* Sticky while the role can be edited: with fifty-odd permissions
                in one column, "Save changes" was a long scroll away from the
                tick that made it appear. Not sticky for a built-in, where the
                footer is only an explanation and would just cover the list. */}
            <div
                className={cn(
                    "flex flex-wrap items-center gap-3 border-t border-muted px-4 py-[13px]",
                    canEdit && !role.system
                        ? "sticky bottom-[var(--tab-bar-inset)] z-10 bg-card shadow-[0_-1px_0_hsl(var(--border)),0_-8px_16px_-12px_hsl(var(--foreground)/0.18)]"
                        : "bg-foreground/[0.03]",
                )}
            >
                {role.system || !canEdit ? (
                    <>
                        <Info
                            aria-hidden
                            className="size-4 shrink-0 text-muted-foreground"
                        />
                        <p className="min-w-0 flex-1 text-[12.5px] leading-[1.5] text-neutral-600 dark:text-muted-foreground">
                            {role.system
                                ? "Built-in roles mean the same thing in every business, so they cannot be changed. Make a role of your own to grant a different set."
                                : "Only someone who can change roles may edit this one."}
                        </p>
                    </>
                ) : (
                    <>
                        <Button
                            type="button"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            disabled={pending || held > 0}
                            onClick={() => setConfirmRemove(true)}
                            title={
                                held > 0
                                    ? "Move the people who hold it to another role first."
                                    : undefined
                            }
                        >
                            Remove role
                        </Button>
                        {held > 0 ? (
                            <span className="text-[11.5px] text-muted-foreground">
                                {held === 1
                                    ? "Move the person who holds it first."
                                    : `Move the ${held} people who hold it first.`}
                            </span>
                        ) : null}
                        <span className="ml-auto flex items-center gap-2">
                            {dirty ? (
                                <>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        disabled={pending}
                                        onClick={() => {
                                            setLabel(role.label);
                                            setGranted(new Set(role.actions));
                                        }}
                                    >
                                        Undo
                                    </Button>
                                    <Button
                                        type="button"
                                        disabled={
                                            pending || label.trim().length === 0
                                        }
                                        onClick={save}
                                    >
                                        {pending ? "Saving…" : "Save changes"}
                                    </Button>
                                </>
                            ) : (
                                <span className="text-[12.5px] text-muted-foreground">
                                    No changes yet
                                </span>
                            )}
                        </span>
                    </>
                )}
            </div>

            <ConfirmDialog
                open={confirmRemove}
                onOpenChange={setConfirmRemove}
                title={`Remove ${role.label}?`}
                description="Nobody holds it, so nobody loses anything. It can be made again later, but its ticks will not come back."
                confirmLabel="Remove role"
                onConfirm={remove}
            />
        </div>
    );
}

/**
 * Name a role, and say where its ticks start.
 *
 * Starting from a built-in is a convenience, not an inheritance: the new role
 * gets a COPY of those permissions and is edited independently afterwards.
 * Owner is not offered, because the one thing Owner has that nothing else may
 * — closing the business — is exactly what an invented role cannot be given.
 */
function NewRoleDialog({
    open,
    onOpenChange,
    roles,
    catalogue,
    onCreated,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    roles: Role[];
    catalogue: RoleCatalogue | null;
    onCreated: (key: string) => void;
}) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [label, setLabel] = useState("");
    const [from, setFrom] = useState<string>("");

    const reset = () => {
        setLabel("");
        setFrom("");
    };

    const create = () =>
        startTransition(async () => {
            const grantable = new Set(
                (catalogue?.capabilities ?? []).map((c) => c.action),
            );
            const base = roles.find((r) => r.key === from);
            const actions = (base?.actions ?? []).filter((a) =>
                grantable.has(a),
            );
            const res = await createRole({ label: label.trim(), actions });
            if (!res.ok) {
                showError(res.error);
                return;
            }
            showSuccess(`${res.data.label} created`);
            onCreated(res.data.key);
            onOpenChange(false);
            reset();
            router.refresh();
        });

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                onOpenChange(next);
                if (!next) reset();
            }}
        >
            <DialogContent className="sm:max-w-[440px]">
                <DialogHeader>
                    <DialogTitle>New role</DialogTitle>
                    <DialogDescription>
                        Name it for the job, then tick what it may do. Nobody
                        holds it until you give it to someone.
                    </DialogDescription>
                </DialogHeader>
                <form
                    className="grid gap-4"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (label.trim()) create();
                    }}
                >
                    <div className="grid gap-1.5">
                        <Label htmlFor="new-role-name">Name</Label>
                        <Input
                            id="new-role-name"
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            placeholder="Stock clerk"
                            maxLength={40}
                            autoFocus
                            disabled={pending}
                        />
                    </div>
                    <fieldset className="grid gap-2">
                        <legend className="mb-1.5 text-sm font-medium">
                            Start from
                        </legend>
                        {START_FROM.map((option) => (
                            <label
                                key={option.key || "blank"}
                                className="flex cursor-pointer items-start gap-2.5 text-[13px]"
                            >
                                <input
                                    type="radio"
                                    name="start-from"
                                    value={option.key}
                                    checked={from === option.key}
                                    onChange={() => setFrom(option.key)}
                                    disabled={pending}
                                    className="mt-[3px] accent-foreground"
                                />
                                <span>{option.label}</span>
                            </label>
                        ))}
                        <p className="text-[11.5px] leading-[1.45] text-muted-foreground">
                            A copy, not a link — changing this role later does
                            not change the one it started from.
                        </p>
                    </fieldset>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={pending}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={pending || label.trim().length === 0}
                        >
                            {pending ? "Creating…" : "Create role"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
