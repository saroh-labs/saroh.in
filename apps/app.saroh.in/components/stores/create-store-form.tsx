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
import { showError } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { trimmedOr } from "@/lib/forms/values";
import { createStore } from "@/lib/stores/actions";
import { storefrontHref } from "@/lib/stores/links";

const formSchema = z.object({
    name: z.string().trim().min(1, { message: "Name is required" }),
    description: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function CreateStoreForm() {
    const router = useRouter();
    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: "",
            description: "",
        },
    });
    const { isSubmitting } = form.formState;
    const name = form.watch("name");

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
                onSubmit={form.handleSubmit(onSubmit)}
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
                <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Description (optional)</FormLabel>
                            <FormControl>
                                <Input disabled={isSubmitting} {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <Button
                    type="submit"
                    className="wk-press justify-self-start"
                    disabled={isSubmitting || !name.trim()}
                >
                    {isSubmitting ? "Creating…" : "Create location"}
                </Button>
            </form>
        </Form>
    );
}
