"use client";

import { Label } from "@saroh/ui/label";
import { Switch } from "@saroh/ui/switch";
import { showError } from "@saroh/ui/toast";
import { useId, useState } from "react";

import { useWebsiteArea } from "@/components/sites/website-area";
import { runAction } from "@/lib/api/run-action";
import { firstName } from "@/lib/names";
import { setStaffTeamPage } from "@/lib/staff/actions";
import type { StaffView } from "@/lib/staff/types";

/**
 * "Show on Our team" (A7, DEC-246): a person's name and role on the
 * website's Our team page, opt-in and off until switched on. The person
 * switches it for themselves, or an owner or admin for them; anyone else
 * reads it. Only with the Website area on, as the page type is.
 */
export function TeamPageSwitch({
    person,
    own,
    canManage,
}: {
    person: StaffView;
    /** The person is the one signed in. */
    own: boolean;
    canManage: boolean;
}) {
    const area = useWebsiteArea();
    const id = useId();
    const [shown, setShown] = useState(person.showOnTeamPage === true);
    const [busy, setBusy] = useState(false);
    const [seen, setSeen] = useState(person);
    if (seen !== person) {
        setSeen(person);
        setShown(person.showOnTeamPage === true);
    }
    if (!area || person.showOnTeamPage === undefined) return null;
    const can = own || canManage;
    const name = firstName(person.name);

    async function change(next: boolean) {
        setShown(next);
        const res = await runAction(() => setStaffTeamPage(person.id, next), {
            setBusy,
        });
        if (!res) return setShown(!next);
        if (!res.ok) {
            setShown(!next);
            showError(res.error);
        }
    }

    return (
        <div
            className="mt-4 flex items-start justify-between gap-3 rounded-lg border bg-card px-3 py-2.5"
            data-team-page-switch=""
        >
            <span className="grid gap-0.5">
                <Label htmlFor={id}>Show on Our team</Label>
                <span className="text-xs text-muted-foreground">
                    {can
                        ? `${own ? "Your" : `${name}'s`} name and role on your website's Our team page. Off until switched on.`
                        : `Only ${name} or an owner or admin can switch this.`}
                </span>
            </span>
            <Switch
                id={id}
                checked={shown}
                disabled={!can || busy}
                onCheckedChange={(v) => void change(v)}
            />
        </div>
    );
}
