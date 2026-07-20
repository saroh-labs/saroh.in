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
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { createCustomer, updateCustomer } from "@/lib/customers/actions";
import type { Customer } from "@/lib/customers/service";

const formSchema = z.object({
    email: z.string().trim().min(1, { message: "Email is required" }),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    phone: z.string().optional(),
    country: z.string().optional(),
    state: z.string().optional(),
    city: z.string().optional(),
    zipCode: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function CustomerForm({
    storeId,
    customer,
}: {
    storeId: string;
    customer?: Customer;
}) {
    const router = useRouter();
    const editing = Boolean(customer);

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            email: customer?.email ?? "",
            firstName: customer?.firstName ?? "",
            lastName: customer?.lastName ?? "",
            phone: customer?.phone ?? "",
            country: customer?.country ?? "",
            state: customer?.state ?? "",
            city: customer?.city ?? "",
            zipCode: customer?.zipCode ?? "",
        },
    });
    const { isSubmitting } = form.formState;

    async function onSubmit(values: FormValues) {
        const input = {
            email: values.email.trim(),
            firstName: values.firstName?.trim() || null,
            lastName: values.lastName?.trim() || null,
            phone: values.phone?.trim() || null,
            country: values.country?.trim() || null,
            state: values.state?.trim() || null,
            city: values.city?.trim() || null,
            zipCode: values.zipCode?.trim() || null,
        };
        const res =
            editing && customer
                ? await updateCustomer(storeId, customer.id, input)
                : await createCustomer(storeId, input);
        if (!res.ok) {
            if (res.field === "email")
                form.setError("email", { message: res.error });
            else toast.error(res.error);
            return;
        }
        toast.success(editing ? "Customer saved" : "Customer created");
        router.push(`/stores/${storeId}/customers`);
    }

    return (
        <Form {...form}>
            <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="grid max-w-lg gap-4"
            >
                <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                                <Input
                                    type="email"
                                    disabled={isSubmitting}
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="firstName"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>First name</FormLabel>
                                <FormControl>
                                    <Input disabled={isSubmitting} {...field} />
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
                                    <Input disabled={isSubmitting} {...field} />
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
                                <Input disabled={isSubmitting} {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="city"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>City</FormLabel>
                                <FormControl>
                                    <Input disabled={isSubmitting} {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="state"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>State</FormLabel>
                                <FormControl>
                                    <Input disabled={isSubmitting} {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="country"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Country</FormLabel>
                                <FormControl>
                                    <Input disabled={isSubmitting} {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="zipCode"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Zip</FormLabel>
                                <FormControl>
                                    <Input disabled={isSubmitting} {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
                <div>
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting
                            ? "Saving…"
                            : editing
                              ? "Save changes"
                              : "Create customer"}
                    </Button>
                </div>
            </form>
        </Form>
    );
}
