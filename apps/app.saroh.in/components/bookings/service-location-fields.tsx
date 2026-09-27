"use client";

import {
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@saroh/ui/form";
import { Input } from "@saroh/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@saroh/ui/toggle-group";
import { useFormContext, useWatch } from "react-hook-form";
import { z } from "zod";

import { SEGMENT, SEGMENTED } from "@/components/shared/segmented";
import type { LocationType } from "@/lib/services/service";
import { needsMeetingLink } from "@/lib/services/service-editor";

/**
 * The two fields both service forms add to their schema. EITHER is accepted
 * so a service made Either elsewhere (the API, a seed) keeps it and its link
 * through a save here; these forms offer only In person and Online, since
 * the booking page doesn't ask Where until E7.
 */
export const locationFields = {
    locationType: z.enum(["IN_PERSON", "ONLINE", "EITHER"]),
    meetingUrl: z.string().trim().max(500),
};

export interface LocationValues {
    locationType: LocationType;
    meetingUrl: string;
}

function isHttps(link: string): boolean {
    try {
        return new URL(link).protocol === "https:";
    } catch {
        return false;
    }
}

/**
 * An online service needs its link, and only an https one — the API says
 * the same, and this says it first, on the field.
 */
export function checkLocation(values: LocationValues, ctx: z.RefinementCtx) {
    if (!needsMeetingLink(values.locationType)) return;
    const link = values.meetingUrl.trim();
    if (!link) {
        ctx.addIssue({
            code: "custom",
            path: ["meetingUrl"],
            message: "Paste the link people join by",
        });
        return;
    }
    if (!isHttps(link)) {
        ctx.addIssue({
            code: "custom",
            path: ["meetingUrl"],
            message:
                "A full https:// link, like https://meet.google.com/abc-defg-hij",
        });
    }
}

/** What the API is sent: the link only when online, cleared otherwise. */
export function locationPayload(values: LocationValues): {
    locationType: LocationType;
    meetingUrl: string | null;
} {
    return needsMeetingLink(values.locationType)
        ? {
              locationType: values.locationType,
              meetingUrl: values.meetingUrl.trim(),
          }
        : { locationType: "IN_PERSON", meetingUrl: null };
}

/**
 * "Where it happens": in person or online, and the link when online. The
 * link is a shared credential — everyone who books gets the same one, and
 * public bookings take no payment — so the help says how to keep a paid
 * class paid.
 */
export function ServiceLocationFields({
    disabled,
    index,
}: {
    disabled?: boolean;
    /** The block's place in the form's arrival stagger (`wk-item`). */
    index: number;
}) {
    const form = useFormContext<LocationValues>();
    const online = useWatch({ control: form.control, name: "locationType" });

    return (
        <div
            className="wk-item grid gap-4"
            style={{ "--wk-i": index } as React.CSSProperties}
        >
            <FormField
                control={form.control}
                name="locationType"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Where it happens</FormLabel>
                        <FormControl>
                            <ToggleGroup
                                type="single"
                                value={field.value}
                                onValueChange={(v) => {
                                    if (v) field.onChange(v);
                                }}
                                disabled={disabled}
                                aria-label="Where it happens"
                                className={SEGMENTED}
                            >
                                <ToggleGroupItem
                                    value="IN_PERSON"
                                    className={SEGMENT}
                                >
                                    In person
                                </ToggleGroupItem>
                                <ToggleGroupItem
                                    value="ONLINE"
                                    className={SEGMENT}
                                >
                                    Online
                                </ToggleGroupItem>
                            </ToggleGroup>
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />
            {needsMeetingLink(online) ? (
                <FormField
                    control={form.control}
                    name="meetingUrl"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Link to join</FormLabel>
                            <FormControl>
                                <Input
                                    type="url"
                                    inputMode="url"
                                    placeholder="https://meet.google.com/abc-defg-hij"
                                    maxLength={500}
                                    disabled={disabled}
                                    {...field}
                                />
                            </FormControl>
                            <FormDescription>
                                Everyone who books gets this same link, on their
                                confirmation and on the booking. For a paid
                                class, set a passcode or a waiting room, or send
                                a link per session yourself. A new link reaches
                                bookings made after you change it.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            ) : null}
        </div>
    );
}
