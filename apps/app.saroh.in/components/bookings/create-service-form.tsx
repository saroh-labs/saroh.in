"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { Textarea } from "@saroh/ui/textarea";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { createService } from "@/lib/services/actions";

/**
 * Create a bookable Service (S4-003). Collects the terms a Service needs to be
 * bookable — name, slot duration, buffers, capacity, timezone and an optional
 * price — and calls the `createService` server action. The timezone defaults to
 * the author's browser zone (an IANA name the api validates). On success it
 * routes to the service editor where availability windows are added.
 */

/** The author's best-guess IANA timezone, for a sensible default. */
function guessTimezone(): string {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
        return "UTC";
    }
}

export function CreateServiceForm() {
    const router = useRouter();
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [durationMinutes, setDurationMinutes] = useState("30");
    const [capacity, setCapacity] = useState("1");
    const [bufferBefore, setBufferBefore] = useState("0");
    const [bufferAfter, setBufferAfter] = useState("0");
    const [timezone, setTimezone] = useState(guessTimezone);
    const [price, setPrice] = useState("");
    const [currency, setCurrency] = useState("");
    const [submitting, setSubmitting] = useState(false);

    async function onSubmit(e: React.FormEvent) {
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

        const priceValue = price.trim() ? Number(price) : undefined;
        if (
            priceValue !== undefined &&
            (Number.isNaN(priceValue) || priceValue < 0)
        ) {
            toast.error("Price must be a positive amount");
            return;
        }

        setSubmitting(true);
        const res = await createService({
            name: name.trim(),
            description: description.trim() || undefined,
            durationMinutes: duration,
            bufferBeforeMinutes: Number(bufferBefore) || 0,
            bufferAfterMinutes: Number(bufferAfter) || 0,
            capacity: Number(capacity) || 1,
            timezone: timezone.trim(),
            priceCents:
                priceValue !== undefined
                    ? Math.round(priceValue * 100)
                    : undefined,
            currency: currency.trim()
                ? currency.trim().toUpperCase()
                : undefined,
        });
        setSubmitting(false);

        if (!res.ok) {
            toast.error(res.error);
            return;
        }
        toast.success("Service created");
        router.push(`/services/${res.data.id}`);
    }

    return (
        <form onSubmit={onSubmit} className="grid max-w-xl gap-4">
            <div className="grid gap-2">
                <Label htmlFor="name">Service name</Label>
                <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Intro call"
                    required
                    disabled={submitting}
                />
            </div>

            <div className="grid gap-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    placeholder="A 30-minute introductory call."
                    disabled={submitting}
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
                        disabled={submitting}
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
                        disabled={submitting}
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
                        disabled={submitting}
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
                        disabled={submitting}
                    />
                </div>
            </div>

            <div className="grid gap-2">
                <Label htmlFor="timezone">Timezone (IANA)</Label>
                <Input
                    id="timezone"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    placeholder="Asia/Kolkata"
                    disabled={submitting}
                />
                <p className="text-xs text-muted-foreground">
                    Availability windows are authored in this timezone.
                </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                    <Label htmlFor="price">Price (optional)</Label>
                    <Input
                        id="price"
                        type="number"
                        min={0}
                        step="0.01"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        placeholder="0.00"
                        disabled={submitting}
                    />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="currency">Currency (optional)</Label>
                    <Input
                        id="currency"
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                        placeholder="INR"
                        maxLength={3}
                        disabled={submitting}
                    />
                </div>
            </div>

            <Button
                type="submit"
                disabled={submitting || !name.trim()}
                className="justify-self-start"
            >
                {submitting ? "Creating…" : "Create service"}
            </Button>
        </form>
    );
}
