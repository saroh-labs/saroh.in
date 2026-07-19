"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { Textarea } from "@saroh/ui/textarea";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { archiveService, updateService } from "@/lib/services/actions";
import type { Service } from "@/lib/services/service";

/**
 * Edit a bookable Service's terms (S4-003). PATCHes only the terms an owner can
 * safely change on an existing service via the `updateService` action, and
 * offers an Archive control (`archiveService`) that stops the service accepting
 * new bookings while its historical bookings survive. Availability windows are
 * edited separately by the AvailabilityRulesEditor.
 */
export function EditServiceForm({ service }: { service: Service }) {
    const router = useRouter();
    const [name, setName] = useState(service.name);
    const [description, setDescription] = useState(service.description ?? "");
    const [durationMinutes, setDurationMinutes] = useState(
        String(service.durationMinutes),
    );
    const [capacity, setCapacity] = useState(String(service.capacity));
    const [bufferBefore, setBufferBefore] = useState(
        String(service.bufferBeforeMinutes),
    );
    const [bufferAfter, setBufferAfter] = useState(
        String(service.bufferAfterMinutes),
    );
    const [timezone, setTimezone] = useState(service.timezone);
    const [saving, setSaving] = useState(false);
    const [archiving, setArchiving] = useState(false);

    async function onSave(e: React.FormEvent) {
        e.preventDefault();
        if (!name.trim()) {
            toast.error("Name is required");
            return;
        }
        const duration = Number(durationMinutes);
        if (!Number.isInteger(duration) || duration < 1) {
            toast.error("Duration must be at least 1 minute");
            return;
        }
        if (!timezone.trim()) {
            toast.error("Timezone is required");
            return;
        }

        setSaving(true);
        const res = await updateService(service.id, {
            name: name.trim(),
            description: description.trim(),
            durationMinutes: duration,
            bufferBeforeMinutes: Number(bufferBefore) || 0,
            bufferAfterMinutes: Number(bufferAfter) || 0,
            capacity: Number(capacity) || 1,
            timezone: timezone.trim(),
        });
        setSaving(false);
        if (!res.ok) {
            toast.error(res.error);
            return;
        }
        toast.success("Service updated");
        router.refresh();
    }

    async function onArchive() {
        setArchiving(true);
        const res = await archiveService(service.id);
        setArchiving(false);
        if (!res.ok) {
            toast.error(res.error);
            return;
        }
        toast.success("Service archived");
        router.push("/services");
    }

    const archived = service.status === "ARCHIVED";

    return (
        <form onSubmit={onSave} className="grid max-w-xl gap-4">
            <div className="grid gap-2">
                <Label htmlFor="name">Service name</Label>
                <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={saving}
                />
            </div>

            <div className="grid gap-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    disabled={saving}
                />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                    <Label htmlFor="duration">Duration (minutes)</Label>
                    <Input
                        id="duration"
                        type="number"
                        min={1}
                        max={1440}
                        value={durationMinutes}
                        onChange={(e) => setDurationMinutes(e.target.value)}
                        disabled={saving}
                    />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="capacity">Capacity (per slot)</Label>
                    <Input
                        id="capacity"
                        type="number"
                        min={1}
                        value={capacity}
                        onChange={(e) => setCapacity(e.target.value)}
                        disabled={saving}
                    />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="bufferBefore">
                        Buffer before (minutes)
                    </Label>
                    <Input
                        id="bufferBefore"
                        type="number"
                        min={0}
                        max={1440}
                        value={bufferBefore}
                        onChange={(e) => setBufferBefore(e.target.value)}
                        disabled={saving}
                    />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="bufferAfter">Buffer after (minutes)</Label>
                    <Input
                        id="bufferAfter"
                        type="number"
                        min={0}
                        max={1440}
                        value={bufferAfter}
                        onChange={(e) => setBufferAfter(e.target.value)}
                        disabled={saving}
                    />
                </div>
            </div>

            <div className="grid gap-2">
                <Label htmlFor="timezone">Timezone (IANA)</Label>
                <Input
                    id="timezone"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    disabled={saving}
                />
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
                <Button type="submit" disabled={saving || !name.trim()}>
                    {saving ? "Saving…" : "Save changes"}
                </Button>
                {!archived && (
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onArchive}
                        disabled={archiving}
                    >
                        {archiving ? "Archiving…" : "Archive service"}
                    </Button>
                )}
            </div>
        </form>
    );
}
