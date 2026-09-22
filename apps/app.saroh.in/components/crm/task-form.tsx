"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@saroh/ui/button";
import { DatePicker } from "@saroh/ui/date-picker";
import { Form, FormControl, FormField, FormItem } from "@saroh/ui/form";
import { Input } from "@saroh/ui/input";
import { TimeSelect } from "@saroh/ui/time-select";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { createTask } from "@/lib/leads/actions";

/**
 * Follow-up task form for a lead (S3-007). Captures what to do (`body`) and a
 * due date/time, then calls the `createTask` server action (`activity:write`)
 * which records an `Activity{ type:"TASK", dueAt }`. On success it clears the
 * form and refreshes so the new task shows on the timeline. The picked day and
 * time are joined in the viewer's own timezone and sent as ISO for the api's
 * `IsISO8601` check.
 *
 * Validation is schema-driven (zod + react-hook-form via the shared `@saroh/ui`
 * `Form`), so the disabled/submitting states are handled by the form primitives
 * rather than hand-rolled `useState`.
 */

const formSchema = z.object({
    body: z.string().trim().min(1),
    dueDate: z.date().optional(),
    dueTime: z.string(),
});

/** A day and an "HH:MM" as one moment, in the viewer's own timezone. */
function joinDue(date: Date, time: string): Date {
    const [h = "0", m = "0"] = time.split(":");
    const at = new Date(date);
    at.setHours(Number(h), Number(m), 0, 0);
    return at;
}

type FormValues = z.infer<typeof formSchema>;

export function TaskForm({ leadId }: { leadId: string }) {
    const router = useRouter();
    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            body: "",
            dueDate: undefined,
            dueTime: "09:00",
        },
    });
    const { isSubmitting } = form.formState;
    const body = form.watch("body");
    const dueDate = form.watch("dueDate");

    async function onSubmit(values: FormValues) {
        if (!values.dueDate) {
            showError("Pick a due date");
            return;
        }
        const parsed = joinDue(values.dueDate, values.dueTime);
        const res = await createTask(leadId, {
            body: values.body,
            dueAt: parsed.toISOString(),
        });
        if (!res.ok) {
            showError(res.error);
            return;
        }
        form.reset({ body: "", dueDate: undefined, dueTime: "09:00" });
        showSuccess("Follow-up scheduled");
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
                                    <Input
                                        aria-label="Follow-up task"
                                        placeholder="Follow up with…"
                                        disabled={isSubmitting}
                                        {...field}
                                    />
                                </FormControl>
                            </FormItem>
                        )}
                    />
                    <div className="flex flex-wrap gap-2">
                        <FormField
                            control={form.control}
                            name="dueDate"
                            render={({ field }) => (
                                <FormItem>
                                    <FormControl>
                                        <DatePicker
                                            aria-label="Due date"
                                            value={field.value}
                                            onValueChange={field.onChange}
                                            disabled={isSubmitting}
                                            disabledDays={{
                                                before: new Date(),
                                            }}
                                        />
                                    </FormControl>
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="dueTime"
                            render={({ field }) => (
                                <FormItem>
                                    <FormControl>
                                        <TimeSelect
                                            aria-label="Due time"
                                            value={field.value}
                                            onValueChange={field.onChange}
                                            disabled={isSubmitting}
                                        />
                                    </FormControl>
                                </FormItem>
                            )}
                        />
                    </div>
                </div>
                <div className="flex justify-end sm:col-span-2">
                    <Button
                        type="submit"
                        size="sm"
                        variant="secondary"
                        className="wk-press"
                        disabled={isSubmitting || !body.trim() || !dueDate}
                    >
                        {isSubmitting ? "Scheduling…" : "Add follow-up"}
                    </Button>
                </div>
            </form>
        </Form>
    );
}
