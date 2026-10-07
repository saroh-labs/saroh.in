"use client";

import { TIMETABLE_MAX_SERVICES } from "@saroh/block-contract";
import { Checkbox } from "@saroh/ui/checkbox";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { Switch } from "@saroh/ui/switch";
import { Textarea } from "@saroh/ui/textarea";

import type { TimetableContent } from "@/lib/sites/service";

import { Field } from "./field";
import { OptionSwitch } from "./option-switch";
import type { SectionFieldsProps } from "./props";
import { ServicesLoadNotice } from "./services-load-notice";

/**
 * The `timetable` section's editor fields (industry templates U2).
 *
 * A title and a line, then which classes: all of them (nothing chosen, the
 * default — a new class shows up on its own) or the ones ticked. The
 * sessions themselves, their times, trainers and places, are read live by
 * the site; the inspector's note above says where they are set (Services).
 *
 * The picker lists the business's active services; only those that are
 * classes (more than one place) and shown on the booking page appear on the
 * site, which the note under the list says. The look, week grid or day by
 * day, is the picker the dispatcher renders above.
 */
export function TimetableFields({
    section,
    services,
    onChange,
}: SectionFieldsProps<"timetable">) {
    const c = section.content;
    const patch = (next: Partial<TimetableContent>) =>
        onChange({ ...section, content: { ...c, ...next } });
    const chosen = c.serviceIds ?? [];
    const id = section.key ?? "timetable";

    const toggle = (serviceId: string, on: boolean) => {
        const next = on
            ? [...chosen, serviceId].slice(0, TIMETABLE_MAX_SERVICES)
            : chosen.filter((s) => s !== serviceId);
        // None chosen is stored as absent: every class.
        patch({ serviceIds: next.length > 0 ? next : undefined });
    };

    return (
        <div className="grid gap-3">
            <Field label="Title">
                <Input
                    value={c.title ?? ""}
                    onChange={(e) =>
                        patch({ title: e.target.value || undefined })
                    }
                    placeholder="This week"
                />
            </Field>
            <Field label="A line under it">
                <Textarea
                    value={c.intro ?? ""}
                    onChange={(e) =>
                        patch({ intro: e.target.value || undefined })
                    }
                    rows={2}
                    placeholder="Optional. Book a class from the timetable."
                />
            </Field>

            <Field label="Classes shown">
                <div className="grid gap-2">
                    <ServicesLoadNotice load={services} />
                    {services.status === "ready" ? (
                        <>
                            <p className="text-sm text-muted-foreground">
                                {chosen.length === 0
                                    ? "Every class on your booking page. Tick some to show only those."
                                    : `${chosen.length} chosen. Untick them all to show every class.`}
                            </p>
                            {services.services
                                .filter((s) => s.status === "ACTIVE")
                                .map((s) => (
                                    <div
                                        key={s.id}
                                        className="flex items-center gap-2"
                                    >
                                        <Checkbox
                                            id={`${id}-svc-${s.id}`}
                                            checked={chosen.includes(s.id)}
                                            onCheckedChange={(on) =>
                                                toggle(s.id, on === true)
                                            }
                                        />
                                        <Label
                                            htmlFor={`${id}-svc-${s.id}`}
                                            className="text-sm font-normal"
                                        >
                                            {s.name}
                                        </Label>
                                    </div>
                                ))}
                            <p className="text-xs text-muted-foreground">
                                Only classes — services with more than one place
                                — show on the timetable. A one-to-one service
                                ticked here is left out.
                            </p>
                        </>
                    ) : null}
                </div>
            </Field>

            <div className="flex items-center justify-between gap-3">
                <Label htmlFor={`${id}-trainer`}>Who takes each class</Label>
                <Switch
                    id={`${id}-trainer`}
                    checked={c.showTrainer !== false}
                    onCheckedChange={(on) =>
                        patch({ showTrainer: on ? undefined : false })
                    }
                />
            </div>
            <div className="grid gap-1">
                <div className="flex items-center justify-between gap-3">
                    <Label htmlFor={`${id}-places`}>Places left</Label>
                    <Switch
                        id={`${id}-places`}
                        checked={c.showPlacesLeft !== false}
                        onCheckedChange={(on) =>
                            patch({ showPlacesLeft: on ? undefined : false })
                        }
                    />
                </div>
                <p className="text-xs text-muted-foreground">
                    A full class always says Full.
                </p>
            </div>
            <OptionSwitch
                label="Monday to Friday only"
                checked={c.weekdaysOnly === true}
                onChange={(on) =>
                    patch({ weekdaysOnly: on ? true : undefined })
                }
                note="Leaves the weekend's classes off this block."
            />
            <OptionSwitch
                label="Count the week"
                checked={c.showCounts === true}
                onChange={(on) => patch({ showCounts: on ? true : undefined })}
                note="Opens the line under the title with “13 sessions across 5 days”, counted from the week shown."
            />
        </div>
    );
}
