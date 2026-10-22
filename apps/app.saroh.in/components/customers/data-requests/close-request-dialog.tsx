"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@saroh/ui/form";
import { Textarea } from "@saroh/ui/textarea";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
    FormDialog,
    FormDialogFoot,
} from "@/components/shared/forms/form-dialog";
import { Refusal } from "@/components/shared/states/refusal";
import { closeDataRequestAction } from "@/lib/customer-workspace/data-request-actions";
import type { DataRequestRow } from "@/lib/customer-workspace/data-requests-view";
import { MAX_CLOSE_REASON } from "@/lib/customer-workspace/data-requests-view";
import { useState } from "react";

// The API's rule (`CloseDataRequestDto`), said before it refuses.
const schema = z.object({
    reason: z
        .string()
        .trim()
        .min(1, { message: "Say why you're closing it" })
        .max(MAX_CLOSE_REASON, {
            message: `A reason can be at most ${MAX_CLOSE_REASON} characters`,
        }),
});
type Values = z.infer<typeof schema>;

/**
 * "Close without removal" (DEC-172, #1107): the one way the team ends a
 * request by hand, and it needs a reason. The reason stays with the
 * business; the customer is emailed only that it was closed. Removing
 * their details is the other way, from the existing removal, which marks
 * the request done.
 */
export function CloseRequestDialog({
    request,
    who,
    open,
    onOpenChange,
    onClosed,
}: {
    request: Pick<DataRequestRow, "id" | "contactId">;
    /** Their name or email, as the row says it. */
    who: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onClosed: (row: DataRequestRow) => void;
}) {
    const [failure, setFailure] = useState<string | null>(null);
    const form = useForm<Values>({
        resolver: zodResolver(schema),
        defaultValues: { reason: "" },
    });
    const { isSubmitting } = form.formState;

    function close() {
        onOpenChange(false);
        setFailure(null);
        form.reset();
    }

    async function onSubmit(values: Values) {
        setFailure(null);
        const res = await closeDataRequestAction(
            request.id,
            values.reason,
            request.contactId,
        ).catch(() => ({
            ok: false as const,
            error: "Couldn't reach Saroh. Nothing has changed.",
        }));
        if (!res.ok) {
            setFailure(res.error);
            return;
        }
        form.reset();
        onClosed(res.data);
    }

    return (
        <FormDialog
            open={open}
            size="md"
            title="Close without removing their details?"
            description={`${who}'s details stay. We'll email them that their request was closed, without your reason.`}
            pending={isSubmitting}
            onClose={close}
        >
            <Form {...form}>
                <FormField
                    control={form.control}
                    name="reason"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Why are you closing it?</FormLabel>
                            <FormControl>
                                <Textarea
                                    {...field}
                                    rows={3}
                                    maxLength={MAX_CLOSE_REASON}
                                    placeholder="e.g. They asked us to keep their account after all"
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <Refusal className="mt-3">{failure}</Refusal>
                <FormDialogFoot
                    saveLabel="Close request"
                    savingLabel="Closing…"
                    cancelLabel="Keep it open"
                    onSubmit={(e) => form.handleSubmit(onSubmit)(e)}
                />
            </Form>
        </FormDialog>
    );
}
