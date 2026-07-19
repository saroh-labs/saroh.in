"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { replaceRules } from "@/lib/services/actions";
import type { AvailabilityRule } from "@/lib/services/service";

/**
 * Availability windows editor for a Service (S4-003). Each row is one recurring
 * weekly window — a day-of-week plus a start/end wall-clock time in the
 * Service's timezone. Rows can be added and removed; Save replaces the ENTIRE
 * rule set through the `replaceRules` action (the api's PUT semantics), so the
 * on-screen rows are exactly what the service ends up with. Times are edited as
 * `HH:MM` and stored as minutes from local midnight.
 */

/** 0 = Sunday … 6 = Saturday (matches the schema). */
const DAY_NAMES = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
];

/** One editable row of local state. */
interface RuleRow {
    dayOfWeek: number;
    /** "HH:MM" wall-clock strings for the native time inputs. */
    start: string;
    end: string;
}

/** Minutes from midnight → "HH:MM". */
function minutesToTime(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "HH:MM" → minutes from midnight, or null when unparseable. */
function timeToMinutes(value: string): number | null {
    const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
    if (!match) return null;
    const h = Number(match[1]);
    const m = Number(match[2]);
    if (h < 0 || h > 24 || m < 0 || m > 59) return null;
    const total = h * 60 + m;
    return total > 1440 ? null : total;
}

export function AvailabilityRulesEditor({
    serviceId,
    initialRules,
}: {
    serviceId: string;
    initialRules: AvailabilityRule[];
}) {
    const router = useRouter();
    const [rows, setRows] = useState<RuleRow[]>(() =>
        initialRules.map((rule) => ({
            dayOfWeek: rule.dayOfWeek,
            start: minutesToTime(rule.startMinute),
            end: minutesToTime(rule.endMinute),
        })),
    );
    const [saving, setSaving] = useState(false);

    function addRow() {
        setRows((prev) => [
            ...prev,
            { dayOfWeek: 1, start: "09:00", end: "17:00" },
        ]);
    }

    function removeRow(index: number) {
        setRows((prev) => prev.filter((_, i) => i !== index));
    }

    function patchRow(index: number, next: Partial<RuleRow>) {
        setRows((prev) =>
            prev.map((row, i) => (i === index ? { ...row, ...next } : row)),
        );
    }

    async function onSave() {
        const rules = [];
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const startMinute = timeToMinutes(row.start);
            const endMinute = timeToMinutes(row.end);
            if (startMinute === null || endMinute === null) {
                toast.error(`Row ${i + 1}: enter valid start and end times`);
                return;
            }
            if (startMinute >= endMinute) {
                toast.error(`Row ${i + 1}: the end must be after the start`);
                return;
            }
            rules.push({ dayOfWeek: row.dayOfWeek, startMinute, endMinute });
        }

        setSaving(true);
        const res = await replaceRules(serviceId, rules);
        setSaving(false);
        if (!res.ok) {
            toast.error(res.error);
            return;
        }
        toast.success("Availability saved");
        router.refresh();
    }

    return (
        <div className="grid gap-3">
            {rows.length === 0 && (
                <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    No availability yet. Add a window so visitors can book.
                </p>
            )}

            {rows.map((row, index) => (
                <div
                    key={index}
                    className="flex flex-wrap items-end gap-3 rounded-md border p-3"
                >
                    <div className="grid gap-1.5">
                        <Label htmlFor={`day-${index}`}>Day</Label>
                        <select
                            id={`day-${index}`}
                            aria-label="Day of week"
                            value={row.dayOfWeek}
                            disabled={saving}
                            onChange={(e) =>
                                patchRow(index, {
                                    dayOfWeek: Number(e.target.value),
                                })
                            }
                            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                        >
                            {DAY_NAMES.map((day, i) => (
                                <option key={i} value={i}>
                                    {day}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor={`start-${index}`}>Start</Label>
                        <Input
                            id={`start-${index}`}
                            type="time"
                            value={row.start}
                            disabled={saving}
                            onChange={(e) =>
                                patchRow(index, { start: e.target.value })
                            }
                            className="w-32"
                        />
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor={`end-${index}`}>End</Label>
                        <Input
                            id={`end-${index}`}
                            type="time"
                            value={row.end}
                            disabled={saving}
                            onChange={(e) =>
                                patchRow(index, { end: e.target.value })
                            }
                            className="w-32"
                        />
                    </div>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label="Remove window"
                        disabled={saving}
                        onClick={() => removeRow(index)}
                    >
                        Remove
                    </Button>
                </div>
            ))}

            <div className="flex flex-wrap items-center gap-3 pt-1">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addRow}
                    disabled={saving}
                >
                    + Add window
                </Button>
                <Button type="button" onClick={onSave} disabled={saving}>
                    {saving ? "Saving…" : "Save availability"}
                </Button>
            </div>
        </div>
    );
}
