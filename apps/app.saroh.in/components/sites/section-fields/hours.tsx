"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@saroh/ui/select";
import { Switch } from "@saroh/ui/switch";

import { listVisitPlacesForPicker } from "@/lib/sites/actions";
import type { HoursContent } from "@/lib/sites/service";
import type { VisitPlacesRead } from "@/lib/stores/storefronts";

import { Field } from "./field";
import { OptionSwitch } from "./option-switch";
import type { SectionFieldsProps } from "./props";

const HOURS = "/settings/organization?section=hours";

/** The Select's value for "no shop chosen": the business's own hours. */
const BUSINESS = "business";

/**
 * The `hours` section's editor fields (industry templates U2).
 *
 * The title, whose hours (the business's own by default, or one location
 * customers visit) and whether closed days are listed. The week itself is
 * read live from Settings › Hours; nothing about it is typed here.
 *
 * The location list is offered only when there is more than one place to
 * choose from — a business with one place needs to choose nothing. A failed
 * read leaves the choice as it was and says so.
 */
export function HoursFields({
    section,
    onChange,
}: SectionFieldsProps<"hours">) {
    const c = section.content;
    const patch = (next: Partial<HoursContent>) =>
        onChange({ ...section, content: { ...c, ...next } });
    const id = section.key ?? "hours";

    const [read, setRead] = useState<VisitPlacesRead | "loading">("loading");
    useEffect(() => {
        let active = true;
        listVisitPlacesForPicker()
            .then((next) => {
                if (active) setRead(next);
            })
            .catch(() => {
                if (active) setRead({ state: "failed", forbidden: false });
            });
        return () => {
            active = false;
        };
    }, []);
    const places = read !== "loading" && read.state === "ok" ? read.places : [];
    const missing =
        c.storeId !== undefined &&
        read !== "loading" &&
        read.state === "ok" &&
        !places.some((p) => p.id === c.storeId);

    return (
        <div className="grid gap-3">
            <Field label="Title">
                <Input
                    value={c.title ?? ""}
                    onChange={(e) =>
                        patch({ title: e.target.value || undefined })
                    }
                    placeholder="Opening hours"
                />
            </Field>

            {places.length > 1 || c.storeId !== undefined ? (
                <Field label="Whose hours">
                    <div className="grid gap-2">
                        {missing ? (
                            <p className="text-sm text-muted-foreground">
                                The location this showed has closed, so the
                                block shows nothing on your site. Choose
                                another, or your business&apos;s hours.
                            </p>
                        ) : null}
                        <Select
                            value={c.storeId ?? BUSINESS}
                            onValueChange={(v) =>
                                patch({
                                    storeId: v === BUSINESS ? undefined : v,
                                })
                            }
                        >
                            <SelectTrigger aria-label="Whose hours">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={BUSINESS}>
                                    Your business&apos;s hours
                                </SelectItem>
                                {places.map((place) => (
                                    <SelectItem key={place.id} value={place.id}>
                                        {place.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </Field>
            ) : null}

            <div className="grid gap-1">
                <div className="flex items-center justify-between gap-3">
                    <Label htmlFor={`${id}-closed`}>List closed days</Label>
                    <Switch
                        id={`${id}-closed`}
                        checked={c.showClosed !== false}
                        onCheckedChange={(on) =>
                            patch({ showClosed: on ? undefined : false })
                        }
                    />
                </div>
                <p className="text-xs text-muted-foreground">
                    On, a closed day says Closed. Off, it is left out.
                </p>
            </div>

            <OptionSwitch
                label="Join days with the same hours"
                checked={c.groupDays === true}
                onChange={(on) => patch({ groupDays: on ? true : undefined })}
                note="On: Tuesday to Friday on one line. Off: one line a day."
            />
            <OptionSwitch
                label="Show the address"
                checked={c.showAddress === true}
                onChange={(on) => patch({ showAddress: on ? true : undefined })}
                note="The address under the hours, for a page without Visit us."
            />

            <p className="text-sm text-muted-foreground">
                The hours are set in{" "}
                <Link
                    href={HOURS}
                    target="_blank"
                    rel="noopener"
                    className="underline hover:text-foreground"
                >
                    Settings › Hours
                </Link>
                . With none saved, this block shows nothing on your site.
            </p>
        </div>
    );
}
