"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@saroh/ui/button";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@saroh/ui/form";
import { Input } from "@saroh/ui/input";
import { Textarea } from "@saroh/ui/textarea";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { createService } from "@/lib/services/actions";

/**
 * Create a bookable Service (S4-003). Collects the terms a Service needs to be
 * bookable — name, slot duration, buffers, capacity, timezone and an optional
 * price — and calls the `createService` server action. The timezone defaults to
 * the author's browser zone (an IANA name the api validates). On success it
 * routes to the service editor where availability windows are added.
 *
 * Validation is schema-driven (zod + react-hook-form via the shared `@saroh/ui`
 * `Form`), so field errors and the disabled/submitting states are handled by
 * the form primitives rather than hand-rolled `useState`.
 */

/** The author's best-guess IANA timezone, for a sensible default. */
function guessTimezone(): string {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
        return "UTC";
    }
}

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
    price: z.string().refine(
        (v) => {
            if (!v.trim()) return true;
            const n = Number(v);
            return !Number.isNaN(n) && n >= 0;
        },
        { message: "Price must be a positive amount" },
    ),
    currency: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function CreateServiceForm() {
    const router = useRouter();
    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: "",
            description: "",
            durationMinutes: "30",
            capacity: "1",
            bufferBefore: "0",
            bufferAfter: "0",
            timezone: guessTimezone(),
            price: "",
            currency: "",
        },
    });
    const { isSubmitting } = form.formState;
    const name = form.watch("name");

    async function onSubmit(values: FormValues) {
        const priceValue = values.price.trim()
            ? Number(values.price)
            : undefined;
        const res = await createService({
            name: values.name.trim(),
            description: values.description?.trim() || undefined,
            durationMinutes: Number(values.durationMinutes),
            bufferBeforeMinutes: Number(values.bufferBefore) || 0,
            bufferAfterMinutes: Number(values.bufferAfter) || 0,
            capacity: Number(values.capacity) || 1,
            timezone: values.timezone.trim(),
            priceCents:
                priceValue !== undefined
                    ? Math.round(priceValue * 100)
                    : undefined,
            currency: values.currency?.trim()
                ? values.currency.trim().toUpperCase()
                : undefined,
        });

        if (!res.ok) {
            toast.error(res.error);
            return;
        }
        toast.success("Service created");
        router.push(`/services/${res.data.id}`);
    }

    return (
        <Form {...form}>
            <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="grid max-w-xl gap-4"
            >
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Service name</FormLabel>
                            <FormControl>
                                <Input
                                    placeholder="Intro call"
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
                    name="description"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Description (optional)</FormLabel>
                            <FormControl>
                                <Textarea
                                    rows={2}
                                    placeholder="A 30-minute introductory call."
                                    disabled={isSubmitting}
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <div className="grid gap-4 sm:grid-cols-2">
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
                        <FormItem>
                            <FormLabel>Timezone (IANA)</FormLabel>
                            <FormControl>
                                <Input
                                    placeholder="Asia/Kolkata"
                                    disabled={isSubmitting}
                                    {...field}
                                />
                            </FormControl>
                            <FormDescription>
                                Availability windows are authored in this
                                timezone.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                        control={form.control}
                        name="price"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Price (optional)</FormLabel>
                                <FormControl>
                                    <Input
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        placeholder="0.00"
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
                                <FormLabel>Currency (optional)</FormLabel>
                                <FormControl>
                                    <Input
                                        placeholder="INR"
                                        maxLength={3}
                                        disabled={isSubmitting}
                                        {...field}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <Button
                    type="submit"
                    disabled={isSubmitting || !name.trim()}
                    className="justify-self-start"
                >
                    {isSubmitting ? "Creating…" : "Create service"}
                </Button>
            </form>
        </Form>
    );
}
