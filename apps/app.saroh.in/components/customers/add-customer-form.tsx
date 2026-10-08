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
import { showError, showSuccess } from "@saroh/ui/toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { personHref } from "@/lib/contacts/person-href";
import { addCustomerAction } from "@/lib/customer-workspace/actions";
import type { EmailHolder } from "@/lib/customer-workspace/service";
import { trimmedOr } from "@/lib/forms/values";

const formSchema = z.object({
    email: z
        .string()
        .trim()
        .min(1, { message: "An email is needed to add them." })
        .email({ message: "That doesn't look like an email address." }),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    phone: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

/**
 * Sell › Customers › Add customer (DEC-056, C14): someone met at the counter
 * or on the phone, added to the business as a contact — never kept per
 * storefront. Saved, their Customer Detail opens; an email a contact already
 * holds says who, with the way to them.
 */
export function AddCustomerForm() {
    const router = useRouter();
    const [holder, setHolder] = useState<EmailHolder | null>(null);
    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: { email: "", firstName: "", lastName: "", phone: "" },
    });
    const { isSubmitting } = form.formState;

    async function onSubmit(values: FormValues) {
        setHolder(null);
        const input = {
            email: values.email.trim(),
            ...optional("firstName", values.firstName),
            ...optional("lastName", values.lastName),
            ...optional("phone", values.phone),
        };
        const res = await addCustomerAction(input);
        if (!res.ok) {
            if (res.holder) setHolder(res.holder);
            if (res.field === "email" || res.holder) {
                form.setError("email", { message: res.error });
            } else showError(res.error);
            return;
        }
        const name = [input.firstName, input.lastName]
            .filter(Boolean)
            .join(" ");
        showSuccess(`${name || input.email} added`);
        router.push(personHref(res.contactId));
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
                <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                                <Input
                                    type="email"
                                    autoComplete="email"
                                    disabled={isSubmitting}
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage />
                            {holder ? (
                                <Link
                                    href={personHref(holder.contactId)}
                                    className="w-fit rounded-[4px] text-[13px] font-semibold text-brand transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:opacity-70"
                                >
                                    {holder.name
                                        ? `Open ${holder.name}`
                                        : "Open them"}
                                </Link>
                            ) : null}
                        </FormItem>
                    )}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                        control={form.control}
                        name="firstName"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>First name</FormLabel>
                                <FormControl>
                                    <Input
                                        autoComplete="given-name"
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
                        name="lastName"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Last name</FormLabel>
                                <FormControl>
                                    <Input
                                        autoComplete="family-name"
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
                    name="phone"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Phone</FormLabel>
                            <FormControl>
                                <Input
                                    type="tel"
                                    autoComplete="tel"
                                    disabled={isSubmitting}
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? "Adding…" : "Add customer"}
                    </Button>
                    <Button asChild variant="outline">
                        <Link href="/commerce/customers">Cancel</Link>
                    </Button>
                </div>
            </form>
        </Form>
    );
}

/** A field the merchant left empty is not sent. */
function optional<K extends string>(
    key: K,
    value: string | undefined,
): Partial<Record<K, string>> {
    const v = trimmedOr(value, null);
    return v ? ({ [key]: v } as Record<K, string>) : {};
}
