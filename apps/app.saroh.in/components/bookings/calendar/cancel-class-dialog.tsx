"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@saroh/ui/form";
import { Textarea } from "@saroh/ui/textarea";
import { useForm } from "react-hook-form";

import { FormDialog, FormDialogFoot } from "@/components/shared/form-dialog";
import type { ClassCancelReason } from "@/lib/services/class-cancel-reason";
import {
    CLASS_CANCEL_REASON_MAX,
    classCancelReasonSchema,
    oneLineReason,
} from "@/lib/services/class-cancel-reason";

/**
 * Cancel the class (DEC-178, #1172): one question before the whole class
 * goes, why. The reason is the business's own words, told to everyone
 * booked and everyone waiting, and kept in each booking's history. The
 * cancel itself is then held ten seconds with its Undo, as before.
 */
export function CancelClassDialog({
    open,
    title,
    at,
    booked,
    onClose,
    onCancel,
}: {
    open: boolean;
    /** The class's name: "Mat Pilates". */
    title: string;
    /** Its time: "6:00 pm". */
    at: string;
    /** Places booked in it now. */
    booked: number;
    onClose: () => void;
    /** The reason given, trimmed and on one line. */
    onCancel: (reason: string) => void;
}) {
    const form = useForm<ClassCancelReason>({
        resolver: zodResolver(classCancelReasonSchema),
        defaultValues: { reason: "" },
    });

    function close() {
        form.reset();
        onClose();
    }

    function onSubmit(values: ClassCancelReason) {
        form.reset();
        onCancel(oneLineReason(values.reason));
    }

    return (
        <FormDialog
            open={open}
            size="sm"
            title="Cancel the class"
            description={`${title} at ${at}: ${booked === 1 ? "the 1 place booked" : `all ${booked} places booked`} will be cancelled.`}
            onClose={close}
        >
            <Form {...form}>
                <FormField
                    control={form.control}
                    name="reason"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>
                                Why is it cancelled? Your customers see this.
                            </FormLabel>
                            <FormControl>
                                <Textarea
                                    {...field}
                                    rows={3}
                                    maxLength={CLASS_CANCEL_REASON_MAX}
                                    placeholder="e.g. Neha is unwell. Sorry for the short notice."
                                />
                            </FormControl>
                            <FormDescription>
                                Up to {CLASS_CANCEL_REASON_MAX} characters.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormDialogFoot
                    saveLabel="Cancel the class"
                    cancelLabel="Keep the class"
                    onSubmit={(e) => form.handleSubmit(onSubmit)(e)}
                />
            </Form>
        </FormDialog>
    );
}
