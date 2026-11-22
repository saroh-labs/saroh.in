"use client";

import { Checkbox } from "@saroh/ui/checkbox";
import { FormSheet } from "@saroh/ui/form-sheet";
import { Label } from "@saroh/ui/label";
import { cn } from "@saroh/ui/lib/utils";
import { ListSearch } from "@saroh/ui/list-search";
import { useState } from "react";

import { usePhone } from "@/components/bookings/calendar/header/use-phone";
import { runAction } from "@/lib/api/run-action";
import { count } from "@/lib/format/plural";
import { initials } from "@/lib/names";
import { setTeamPage } from "@/lib/staff/actions";
import type { StaffView } from "@/lib/staff/types";

/** A membership role's key in the board's words; a custom role says Staff. */
export function teamRoleWord(role: string | undefined): string {
    if (role === "OWNER") return "Owner";
    if (role === "ADMIN") return "Admin";
    return "Staff";
}

/** A round avatar of initials; staff carry no photo (DEC-246). */
export function TeamAvatar({
    name,
    owner = false,
}: {
    name: string;
    owner?: boolean;
}) {
    return (
        <span
            aria-hidden
            className={cn(
                "inline-flex size-8 flex-none items-center justify-center rounded-full text-xs font-semibold coarse:size-[34px]",
                owner
                    ? "bg-foreground text-background"
                    : "bg-muted text-foreground",
            )}
        >
            {initials(name)}
        </span>
    );
}

/**
 * Add people to Our team (round 3, `EBTeamPicker` 2 and
 * `EBTeamPickerPhone`): an owner or admin picks who visitors see, from the
 * whole team, and saves the whole list. Nobody is added on their own and
 * nobody is told. The same picker opens from Add a page's Our team and from
 * the page's People list. Saving answers with the people now chosen, in the
 * team's order.
 */
export function TeamPicker({
    team,
    onClose,
    onSaved,
}: {
    /** The active team, `showOnTeamPage` saying who is on the page now. */
    team: StaffView[];
    onClose: () => void;
    onSaved: (chosen: StaffView[]) => void;
}) {
    const phone = usePhone();
    const [picked, setPicked] = useState<string[]>(() =>
        team.filter((p) => p.showOnTeamPage === true).map((p) => p.id),
    );
    const [query, setQuery] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const q = query.trim().toLowerCase();
    const shown = team.filter((p) => p.name.toLowerCase().includes(q));
    const toggle = (id: string, on: boolean) =>
        setPicked((prev) =>
            on ? [...prev, id] : prev.filter((p) => p !== id),
        );

    async function save() {
        setError(null);
        const res = await runAction(() => setTeamPage(picked), { setBusy });
        if (!res) return;
        if (!res.ok) {
            setError(res.error);
            return;
        }
        onSaved(team.filter((p) => picked.includes(p.id)));
    }

    return (
        <FormSheet
            open
            title={phone ? "Who appears on Our team" : "Add people to Our team"}
            description={
                phone
                    ? "Only owners and admins choose. Nobody is told."
                    : "Pick who visitors see. Nobody is added on their own, and nobody is told."
            }
            pending={busy}
            saveLabel={
                phone
                    ? `Save · ${count(picked.length, "person", "people")}`
                    : "Save"
            }
            savingLabel="Saving…"
            footNote={phone ? undefined : `${picked.length} chosen`}
            bottomOnPhone
            dirty
            onClose={onClose}
            onSubmit={(e) => {
                e.preventDefault();
                void save();
            }}
        >
            <div className="grid gap-2" data-team-picker="">
                <ListSearch
                    placeholder="Search your team"
                    onSearch={setQuery}
                    shortcut={false}
                />
                <ul className="grid gap-2">
                    {shown.map((p) => {
                        const on = picked.includes(p.id);
                        const role = p.membership?.role;
                        return (
                            <li key={p.id}>
                                <Label
                                    data-ph-mask=""
                                    className={cn(
                                        "flex min-h-[52px] cursor-pointer items-center gap-3 rounded-[10px] border px-2.5 py-1.5 coarse:min-h-14",
                                        on &&
                                            "border-foreground ring-1 ring-inset ring-foreground",
                                    )}
                                >
                                    <Checkbox
                                        checked={on}
                                        onCheckedChange={(v) =>
                                            toggle(p.id, v === true)
                                        }
                                    />
                                    <TeamAvatar
                                        name={p.name}
                                        owner={role === "OWNER"}
                                    />
                                    <span className="grid min-w-0 flex-1">
                                        <span className="truncate text-[0.84rem] font-semibold">
                                            {p.name}
                                        </span>
                                        <span className="truncate text-xs font-normal text-muted-foreground">
                                            {on
                                                ? phone && p.title
                                                    ? p.title
                                                    : "On the page"
                                                : "Not on the page"}
                                        </span>
                                    </span>
                                    {p.membership ? (
                                        <span className="rounded-full bg-muted px-2 text-xs font-semibold leading-5 text-muted-foreground">
                                            {teamRoleWord(role)}
                                        </span>
                                    ) : null}
                                </Label>
                            </li>
                        );
                    })}
                </ul>
                <p className="text-xs text-muted-foreground">
                    {phone
                        ? "Shows a name, the words you write and a profile photo. Never email, phone or hours. Reorder on the page's People list."
                        : "Only a name, the words you write and a profile photo are shown. Email, phone and hours never are."}
                </p>
                {error ? (
                    <p role="alert" className="text-sm text-destructive">
                        {error}
                    </p>
                ) : null}
            </div>
        </FormSheet>
    );
}
