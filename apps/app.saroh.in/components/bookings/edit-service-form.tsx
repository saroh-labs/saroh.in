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
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { archiveService, updateService } from "@/lib/services/actions";
import type { Service } from "@/lib/services/service";

/**
 * Edit a bookable Service's terms (S4-003). PATCHes only the terms an owner can
 * safely change on an existing service via the `updateService` action, and
 * offers an Archive control (`archiveService`) that stops the service accepting
 * new bookings while its historical bookings survive. Availability windows are
 * edited separately by the AvailabilityRulesEditor.
 *
 * Validation is schema-driven (zod + react-hook-form via the shared `@saroh/ui`
 * `Form`), so field errors and the disabled/submitting states are handled by
 * the form primitives rather than hand-rolled `useState`.
 */

const formSchema = z.object({
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
});

type FormValues = z.infer<typeof formSchema>;

export function EditServiceForm({ service }: { service: Service }) {
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
        },
    });
    const { isSubmitting } = form.formState;
    const name = form.watch("name");
    const [archiving, setArchiving] = useState(false);

    async function onSave(values: FormValues) {
        const res = await updateService(service.id, {
            name: values.name.trim(),
            description: values.description?.trim() ?? "",
            durationMinutes: Number(values.durationMinutes),
            bufferBeforeMinutes: Number(values.bufferBefore) || 0,
            bufferAfterMinutes: Number(values.bufferAfter) || 0,
            capacity: Number(values.capacity) || 1,
            timezone: values.timezone.trim(),
        });
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
                            <FormLabel>Timezone (IANA)</FormLabel>
                            <FormControl>
                                <Input disabled={isSubmitting} {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <div
                    className="wk-item flex flex-wrap items-center gap-3 pt-2"
                    style={{ "--wk-i": 4 } as React.CSSProperties}
                >
                    <Button
                        type="submit"
                        disabled={isSubmitting || !name.trim()}
                        className="wk-press"
                    >
                        {isSubmitting ? "Saving…" : "Save changes"}
                    </Button>
                    {!archived && (
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onArchive}
                            disabled={archiving}
                            className="wk-press"
                        >
                            {archiving ? "Archiving…" : "Archive service"}
                        </Button>
                    )}
                </div>
            </form>
        </Form>
    );
}
