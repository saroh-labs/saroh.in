"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@saroh/ui/button";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@saroh/ui/form";
import { Input } from "@saroh/ui/input";
import { Textarea } from "@saroh/ui/textarea";
import { showError, showSuccess, showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
    checkLocation,
    locationFields,
    locationPayload,
    ServiceLocationFields,
} from "@/components/bookings/service-location-fields";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { OptionSelect } from "@/components/shared/option-select";
import { TimezoneSelect } from "@/components/shared/timezone-select";
import { archiveService, updateService } from "@/lib/services/actions";

import {
    gstDefaults,
    gstFields,
    gstPayload,
    ServiceGstFields,
} from "@/components/bookings/service-gst-fields";
import type { Service } from "@/lib/services/service";

/**
 * Edit a bookable Service's terms (S4-003): name, length, buffers, capacity,
 * timezone and price. Taking bookings is a reversible status (Stop / Take
 * bookings again, with undo); deleting it is separate and asks first, because
 * it cannot be undone from here. Availability windows are edited separately by
 * the AvailabilityRulesEditor.
 *
 * Validation is schema-driven (zod + react-hook-form via the shared `@saroh/ui`
 * `Form`), so field errors and the disabled/submitting states are handled by
 * the form primitives rather than hand-rolled `useState`.
 */

const formSchema = z
    .object({
        name: z.string().trim().min(1, { message: "Name is required" }),
        description: z.string().optional(),
        durationMinutes: z.string().refine(
            (v) => {
                const n = Number(v);
                return Number.isInteger(n) && n >= 1;
            },
            { message: "Duration must be at least 1 minute" },
        ),
        capacity: z.string().optional(),
        bufferBefore: z.string().optional(),
        bufferAfter: z.string().optional(),
        timezone: z.string().trim().min(1, { message: "Timezone is required" }),
        price: z
            .string()
            .trim()
            .refine((v) => v === "" || /^\d+(\.\d{1,2})?$/.test(v), {
                message: "A price in numbers, like 1800 — or empty.",
            }),
        currency: z.string(),
        ...gstFields,
        ...locationFields,
    })
    .superRefine(checkLocation);

type FormValues = z.infer<typeof formSchema>;

export function EditServiceForm({
    service,
    defaultCurrency = "INR",
}: {
    service: Service;
    /** The business's currency, for a service that has no price yet. */
    defaultCurrency?: string;
}) {
    const router = useRouter();
    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: service.name,
            description: service.description ?? "",
            durationMinutes: String(service.durationMinutes),
            capacity: String(service.capacity),
            bufferBefore: String(service.bufferBeforeMinutes),
            bufferAfter: String(service.bufferAfterMinutes),
            timezone: service.timezone,
            price:
                service.priceCents === null
                    ? ""
                    : (service.priceCents / 100).toString(),
            currency: service.currency ?? defaultCurrency,
            ...gstDefaults(service),
            locationType: service.locationType,
            meetingUrl: service.meetingUrl ?? "",
        },
    });
    const { isSubmitting } = form.formState;
    const name = form.watch("name");
    const [busy, setBusy] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);

    async function onSave(values: FormValues) {
        if (!values.price && service.priceCents !== null) {
            // The API sets a price but cannot remove one; say so rather than
            // report a save that quietly kept the old price.
            form.setError("price", {
                message:
                    "A price can be changed but not removed yet. Set it to 0 if it is free now.",
            });
            return;
        }
        const res = await updateService(service.id, {
            name: values.name.trim(),
            description: values.description?.trim() ?? "",
            durationMinutes: Number(values.durationMinutes),
            bufferBeforeMinutes: Number(values.bufferBefore) || 0,
            bufferAfterMinutes: Number(values.bufferAfter) || 0,
            capacity: Number(values.capacity) || 1,
            timezone: values.timezone.trim(),
            ...(values.price
                ? {
                      priceCents: Math.round(Number(values.price) * 100),
                      currency: values.currency,
                  }
                : {}),
            ...gstPayload(values),
            ...locationPayload(values),
        });
        if (!res.ok) {
            if (res.field === "meetingUrl") {
                form.setError("meetingUrl", { message: res.error });
                return;
            }
            if (res.field === "gstRate" || res.field === "sacCode") {
                form.setError(res.field, { message: res.error });
                return;
            }
            showError(res.error);
            return;
        }
        showSuccess("Service updated");
        router.refresh();
    }

    /**
     * Stop, or start again, taking bookings. A status, so it is reversible —
     * the service stays in the list as "Not bookable", and its page offers
     * the way back — and so it takes undo rather than a confirm.
     */
    async function setBookable(bookable: boolean) {
        setBusy(true);
        const res = await updateService(service.id, {
            status: bookable ? "ACTIVE" : "ARCHIVED",
        });
        setBusy(false);
        if (!res.ok) {
            showError(res.error);
            return;
        }
        router.refresh();
        if (bookable) {
            showSuccess(`${service.name} is taking bookings again`);
        } else {
            showUndo(`${service.name} has stopped taking bookings`, () => {
                void setBookable(true);
            });
        }
    }

    /**
     * Take it out of Services altogether. Bookings already made keep it; it
     * cannot be brought back from here, so this one asks first.
     */
    async function onDelete() {
        setBusy(true);
        const res = await archiveService(service.id);
        setBusy(false);
        if (!res.ok) {
            showError(res.error);
            return;
        }
        showSuccess(`${service.name} deleted`);
        router.push("/services");
    }

    const archived = service.status === "ARCHIVED";

    return (
        <Form {...form}>
            <form
                onSubmit={form.handleSubmit(onSave)}
                className="grid max-w-xl gap-4"
            >
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        // `wk-item` staggers the form's arrival (workspace.css);
                        // `--wk-i` is the block's position, not the field's.
                        <FormItem
                            className="wk-item"
                            style={{ "--wk-i": 0 } as React.CSSProperties}
                        >
                            <FormLabel>Service name</FormLabel>
                            <FormControl>
                                <Input disabled={isSubmitting} {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                        <FormItem
                            className="wk-item"
                            style={{ "--wk-i": 1 } as React.CSSProperties}
                        >
                            <FormLabel>Description</FormLabel>
                            <FormControl>
                                <Textarea
                                    rows={2}
                                    disabled={isSubmitting}
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <div
                    className="wk-item grid gap-4 sm:grid-cols-2"
                    style={{ "--wk-i": 2 } as React.CSSProperties}
                >
                    <FormField
                        control={form.control}
                        name="durationMinutes"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Duration (minutes)</FormLabel>
                                <FormControl>
                                    <Input
                                        type="number"
                                        min={1}
                                        max={1440}
                                        disabled={isSubmitting}
                                        {...field}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="capacity"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Capacity (per slot)</FormLabel>
                                <FormControl>
                                    <Input
                                        type="number"
                                        min={1}
                                        disabled={isSubmitting}
                                        {...field}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="bufferBefore"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Buffer before (minutes)</FormLabel>
                                <FormControl>
                                    <Input
                                        type="number"
                                        min={0}
                                        max={1440}
                                        disabled={isSubmitting}
                                        {...field}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="bufferAfter"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Buffer after (minutes)</FormLabel>
                                <FormControl>
                                    <Input
                                        type="number"
                                        min={0}
                                        max={1440}
                                        disabled={isSubmitting}
                                        {...field}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <FormField
                    control={form.control}
                    name="timezone"
                    render={({ field }) => (
                        <FormItem
                            className="wk-item"
                            style={{ "--wk-i": 3 } as React.CSSProperties}
                        >
                            <FormLabel>Timezone</FormLabel>
                            <FormControl>
                                <TimezoneSelect
                                    value={field.value}
                                    onValueChange={field.onChange}
                                    disabled={isSubmitting}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <div
                    className="wk-item grid gap-4 sm:grid-cols-[2fr_1fr]"
                    style={{ "--wk-i": 3 } as React.CSSProperties}
                >
                    <FormField
                        control={form.control}
                        name="price"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Price</FormLabel>
                                <FormControl>
                                    <Input
                                        inputMode="decimal"
                                        placeholder="Empty if paid in person"
                                        disabled={isSubmitting}
                                        {...field}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="currency"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Currency</FormLabel>
                                <FormControl>
                                    <OptionSelect
                                        value={field.value}
                                        onValueChange={field.onChange}
                                        disabled={isSubmitting}
                                        options={[
                                            field.value,
                                            ...[
                                                "INR",
                                                "USD",
                                                "EUR",
                                                "GBP",
                                                "AED",
                                                "SGD",
                                            ].filter((c) => c !== field.value),
                                        ].map((c) => ({ value: c, label: c }))}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <ServiceGstFields disabled={isSubmitting} index={3} />

                <ServiceLocationFields disabled={isSubmitting} index={4} />

                <div
                    className="wk-item flex flex-wrap items-center gap-3 pt-2"
                    style={{ "--wk-i": 5 } as React.CSSProperties}
                >
                    <Button
                        type="submit"
                        disabled={isSubmitting || !name.trim()}
                        className="wk-press"
                    >
                        {isSubmitting ? "Saving…" : "Save changes"}
                    </Button>
                    {archived ? (
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => void setBookable(true)}
                            disabled={busy}
                            className="wk-press"
                        >
                            Take bookings again
                        </Button>
                    ) : (
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => void setBookable(false)}
                            disabled={busy}
                            className="wk-press"
                        >
                            Stop taking bookings
                        </Button>
                    )}
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setConfirmDelete(true)}
                        disabled={busy}
                        className="wk-press text-destructive hover:text-destructive"
                    >
                        Delete service
                    </Button>
                </div>
                <ConfirmDialog
                    open={confirmDelete}
                    onOpenChange={setConfirmDelete}
                    title={`Delete ${service.name}?`}
                    description="It leaves your services and can no longer be booked. Bookings already made keep it. This cannot be undone — to stop bookings for now, choose Stop taking bookings instead."
                    confirmLabel="Delete service"
                    onConfirm={() => void onDelete()}
                />
            </form>
        </Form>
    );
}
