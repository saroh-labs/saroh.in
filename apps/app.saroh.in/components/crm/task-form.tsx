"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@saroh/ui/button";
import { Form, FormControl, FormField, FormItem } from "@saroh/ui/form";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { createTask } from "@/lib/leads/actions";

/**
 * Follow-up task form for a lead (S3-007). Captures what to do (`body`) and a
 * due date/time, then calls the `createTask` server action (`activity:write`)
 * which records an `Activity{ type:"TASK", dueAt }`. On success it clears the
 * form and refreshes so the new task shows on the timeline. The datetime-local
 * input value is converted to an ISO string for the api's `IsISO8601` check.
 *
 * Validation is schema-driven (zod + react-hook-form via the shared `@saroh/ui`
 * `Form`), so the disabled/submitting states are handled by the form primitives
 * rather than hand-rolled `useState`.
 */

const formSchema = z.object({
    body: z.string().trim().min(1),
    due: z.string().min(1),
});

type FormValues = z.infer<typeof formSchema>;

export function TaskForm({ leadId }: { leadId: string }) {
    const router = useRouter();
    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            body: "",
            due: "",
        },
    });
    const { isSubmitting } = form.formState;
    const body = form.watch("body");
    const due = form.watch("due");

    async function onSubmit(values: FormValues) {
        const parsed = new Date(values.due);
        if (Number.isNaN(parsed.getTime())) {
            toast.error("Enter a valid due date");
            return;
        }
        const res = await createTask(leadId, {
            body: values.body,
            dueAt: parsed.toISOString(),
        });
        if (!res.ok) {
            toast.error(res.error);
            return;
        }
        form.reset({ body: "", due: "" });
        toast.success("Follow-up scheduled");
        router.refresh();
    }

    return (
        <Form {...form}>
            <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="grid gap-2 sm:grid-cols-[1fr_auto]"
            >
                <div className="grid gap-2 sm:col-span-2 sm:grid-cols-2">
                    <FormField
                        control={form.control}
                        name="body"
                        render={({ field }) => (
                            <FormItem>
                                <FormControl>
                                    <input
                                        aria-label="Follow-up task"
                                        placeholder="Follow up with…"
                                        disabled={isSubmitting}
                                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                                        {...field}
                                    />
                                </FormControl>
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="due"
                        render={({ field }) => (
                            <FormItem>
                                <FormControl>
                                    <input
                                        aria-label="Due date"
                                        type="datetime-local"
                                        disabled={isSubmitting}
                                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                                        {...field}
                                    />
                                </FormControl>
                            </FormItem>
                        )}
                    />
                </div>
                <div className="flex justify-end sm:col-span-2">
                    <Button
                        type="submit"
                        size="sm"
                        variant="secondary"
                        disabled={isSubmitting || !body.trim() || !due}
                    >
                        {isSubmitting ? "Scheduling…" : "Add follow-up"}
                    </Button>
                </div>
            </form>
        </Form>
    );
}
