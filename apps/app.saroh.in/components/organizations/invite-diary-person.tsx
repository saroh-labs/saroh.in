"use client";

import { OptionSelect } from "@/components/shared/option-select";
import type { DiaryPerson } from "@/lib/organizations/calendar-only";

/**
 * "Who on the diary is this?" in the invite (#868). Someone who takes
 * bookings with no login can be given one: picking them makes the invite
 * theirs — accepting links their diary to the login — and picks Calendar
 * only, which the owner may change. Shown only when there is someone to
 * pick.
 */
export function InviteDiaryPerson({
    people,
    value,
    disabled,
    onPick,
}: {
    people: readonly DiaryPerson[];
    value: string;
    disabled: boolean;
    onPick: (staffId: string) => void;
}) {
    if (people.length === 0) return null;
    const picked = people.find((p) => p.id === value);
    return (
        <div className="space-y-1.5">
            <label
                htmlFor="invite-diary-person"
                className="block text-[12.5px] font-medium"
            >
                On the diary as
            </label>
            <OptionSelect
                id="invite-diary-person"
                value={value}
                onValueChange={onPick}
                disabled={disabled}
                aria-describedby="invite-diary-person-hint"
                options={[
                    { value: "", label: "No one — they don't take bookings" },
                    ...people.map((p) => ({ value: p.id, label: p.name })),
                ]}
            />
            <p
                id="invite-diary-person-hint"
                className="text-[12px] leading-[1.45] text-muted-foreground"
            >
                {picked
                    ? `${picked.name} already takes bookings, so this uses no extra seat. Their diary becomes theirs to see when they join.`
                    : "Pick someone who takes bookings with no login to give them one."}
            </p>
        </div>
    );
}
