"use client";

import type { DiaryPerson } from "@/lib/organizations/calendar-only";
import { Field } from "@saroh/ui/field";
import { OptionSelect } from "@saroh/ui/option-select";

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
        <Field
            label="On the diary as"
            hint={
                picked
                    ? `${picked.name} already takes bookings, so this uses no extra seat. Their diary becomes theirs to see when they join.`
                    : "Pick someone who takes bookings with no login to give them one."
            }
        >
            <OptionSelect
                id="invite-diary-person"
                value={value}
                onValueChange={onPick}
                disabled={disabled}
                options={[
                    { value: "", label: "No one — they don't take bookings" },
                    ...people.map((p) => ({ value: p.id, label: p.name })),
                ]}
            />
        </Field>
    );
}
