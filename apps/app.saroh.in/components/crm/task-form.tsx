"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@saroh/ui/button";
import { DatePicker } from "@saroh/ui/date-picker";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
} from "@saroh/ui/form";
import { Input } from "@saroh/ui/input";
import { TimeSelect } from "@saroh/ui/time-select";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
    ACTION_SHEET_BODY,
    ACTION_SHEET_FORM,
    ActionSheetFooter,
} from "@/components/shared/action-sheet";
import { createTask } from "@/lib/leads/actions";

/**
 * Follow-up task form for a lead (S3-007), drawn inside the lead's "Schedule
 * follow-up" sheet. Captures what to do (`body`) and a due date/time, then
 * calls the `createTask` server action (`activity:write`) which records an
 * `Activity{ type:"TASK", dueAt }`. On success it closes the sheet (`onDone`)
 * and refreshes so the new task shows on the timeline; a refusal is a toast
 * and the sheet stays open with what was filled in. The picked day and time
 * are joined in the viewer's own timezone and sent as ISO for the api's
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

export function TaskForm({
    leadId,
    onDone,
    onDirtyChange,
}: {
    leadId: string;
    /** The follow-up was saved: close the sheet. */
    onDone: () => void;
    /** Something is filled in, so a stray press outside must not close it. */
    onDirtyChange?: (dirty: boolean) => void;
}) {
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
    const dirty = body.trim() !== "" || dueDate !== undefined;

    useEffect(() => {
        onDirtyChange?.(dirty);
    }, [dirty, onDirtyChange]);

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
        showSuccess("Follow-up scheduled");
        onDone();
        router.refresh();
    }

    return (
        <Form {...form}>
            <form
                onSubmit={form.handleSubmit(onSubmit)}
                className={ACTION_SHEET_FORM}
            >
                <div className={ACTION_SHEET_BODY}>
                    <FormField
                        control={form.control}
                        name="body"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>What to do</FormLabel>
                                <FormControl>
                                    <Input
                                        placeholder="Follow up with…"
                                        disabled={isSubmitting}
                                        {...field}
                                    />
                                </FormControl>
                            </FormItem>
                        )}
                    />
                    <div className="flex flex-wrap gap-4">
                        <FormField
                            control={form.control}
                            name="dueDate"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Due date</FormLabel>
                                    <FormControl>
                                        <DatePicker
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
                                    <FormLabel>Due time</FormLabel>
                                    <FormControl>
                                        <TimeSelect
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
                <ActionSheetFooter busy={isSubmitting}>
                    <Button
                        type="submit"
                        className="wk-press"
                        disabled={isSubmitting || !body.trim() || !dueDate}
                    >
                        {isSubmitting ? "Scheduling…" : "Add follow-up"}
                    </Button>
                </ActionSheetFooter>
            </form>
        </Form>
    );
}
