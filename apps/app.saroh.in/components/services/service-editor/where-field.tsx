"use client";

import { Input } from "@saroh/ui/input";
import { useId } from "react";

import { Chip, Eyebrow } from "@/components/bookings/calendar/parts";
import type { LocationType } from "@/lib/services/service";
import { needsMeetingLink, whereNote } from "@/lib/services/service-editor";

import { FIELD, HELP, LABEL } from "./fields";

const WHERE: [LocationType, string][] = [
    ["IN_PERSON", "In person"],
    ["ONLINE", "Online"],
    ["EITHER", "Either — they choose"],
];

/**
 * Where it happens (E2): in person, online, or either — the customer
 * chooses when booking. The link people join by is asked for whenever it
 * can happen online; it is a shared credential, so the help says how to
 * keep a paid session paid.
 */
export function WhereField({
    where,
    meetingUrl,
    onChange,
}: {
    where: LocationType;
    meetingUrl: string;
    onChange: (patch: { where?: LocationType; meetingUrl?: string }) => void;
}) {
    const ids = { label: useId(), link: useId(), linkHelp: useId() };
    return (
        <>
            <Eyebrow id={ids.label} className="mt-3">
                Where
            </Eyebrow>
            <div
                role="radiogroup"
                aria-labelledby={ids.label}
                className="flex flex-wrap gap-1.5"
            >
                {WHERE.map(([value, label]) => (
                    <Chip
                        key={value}
                        on={where === value}
                        className="h-[34px] text-[13px]"
                        onClick={() => onChange({ where: value })}
                    >
                        {label}
                    </Chip>
                ))}
            </div>
            <p className={HELP}>{whereNote(where)}</p>
            {needsMeetingLink(where) ? (
                <div className="mt-3">
                    <label htmlFor={ids.link} className={LABEL}>
                        Link to join
                    </label>
                    <Input
                        id={ids.link}
                        type="url"
                        inputMode="url"
                        placeholder="https://meet.google.com/abc-defg-hij"
                        maxLength={500}
                        value={meetingUrl}
                        aria-describedby={ids.linkHelp}
                        onChange={(e) =>
                            onChange({ meetingUrl: e.target.value })
                        }
                        className={FIELD}
                    />
                    <p id={ids.linkHelp} className={HELP}>
                        Everyone who books online gets this same link, on their
                        confirmation and on the booking. For a paid session, set
                        a passcode or a waiting room. A new link reaches
                        bookings made after you save.
                    </p>
                </div>
            ) : null}
        </>
    );
}
