"use client";

import { submitOnModEnter } from "@/lib/hooks/keyboard-save";
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
import { showError } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { lostNew, useLeaveGuard } from "@/components/shared/use-leave-guard";
import { trimmedOr } from "@/lib/forms/values";
import { PAGE_FORM, toFirstError } from "@/lib/hooks/page-form";
import { createStore } from "@/lib/stores/actions";
import { storefrontHref } from "@/lib/stores/links";

const formSchema = z.object({
    name: z.string().trim().min(1, { message: "Add a name." }),
    description: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function CreateStoreForm() {
    const router = useRouter();
    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        ...PAGE_FORM,
        defaultValues: {
            name: "",
            description: "",
        },
    });
    const { isSubmitting, isDirty } = form.formState;
    const guard = useLeaveGuard({ dirty: isDirty, lost: lostNew("location") });

    async function onSubmit(values: FormValues) {
        const res = await createStore({
            name: values.name,
            description: trimmedOr(values.description, undefined),
        });
        if (!res.ok) {
            if (res.field === "name") {
                form.setError(res.field, { message: res.error });
            } else {
                showError(res.error);
            }
            return;
        }
        router.push(storefrontHref(res.data.id));
    }

    return (
        <Form {...form}>
            <form
                onKeyDown={submitOnModEnter}
                onSubmit={form.handleSubmit(onSubmit, toFirstError)}
                className="grid max-w-md gap-4"
            >
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Location name</FormLabel>
                            <FormControl>
                                <Input
                                    placeholder="Hill Road shop"
                                    disabled={isSubmitting}
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <Button
                    type="submit"
                    className="wk-press justify-self-start"
                    busy={isSubmitting}
                    busyLabel="Creating…"
                >
                    Create location
                </Button>
            </form>
            {guard.dialog}
        </Form>
    );
}
