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
import { Input } from "@saroh/ui/input";
import { showError, showSuccess } from "@saroh/ui/toast";

import { BusinessPhoneInput } from "@/components/shared/fields/business-phone-input";
import {
    FormSheetBody,
    FormSheetFoot,
} from "@/components/shared/forms/form-sheet";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { createCustomer, updateCustomer } from "@/lib/customers/actions";
import { customerHref } from "@/lib/customers/links";
import type { Customer } from "@/lib/customers/service";
import { trimmedOr } from "@/lib/forms/values";
import { phoneSchemaKeeping } from "@/lib/organizations/business-phone";

/** The form's rules; a phone saved before numbers were checked stays. */
const schemaFor = (savedPhone: string) =>
    z.object({
        email: z
            .string()
            .trim()
            .min(1, { message: "Add their email address." }),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        phone: phoneSchemaKeeping(savedPhone).optional(),
        country: z.string().optional(),
        state: z.string().optional(),
        city: z.string().optional(),
        zipCode: z.string().optional(),
    });

type FormValues = z.infer<ReturnType<typeof schemaFor>>;

export function CustomerForm({
    storeId,
    customer,
    onSaved,
}: {
    storeId: string;
    customer?: Customer;
    /** After an edit is saved: the sheet that holds the form closes. */
    onSaved?: () => void;
}) {
    const router = useRouter();
    const editing = Boolean(customer);

    const form = useForm<FormValues>({
        resolver: zodResolver(schemaFor(customer?.phone ?? "")),
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
            firstName: trimmedOr(values.firstName, null),
            lastName: trimmedOr(values.lastName, null),
            phone: trimmedOr(values.phone, null),
            country: trimmedOr(values.country, null),
            state: trimmedOr(values.state, null),
            city: trimmedOr(values.city, null),
            zipCode: trimmedOr(values.zipCode, null),
        };
        const res =
            editing && customer
                ? await updateCustomer(storeId, customer.id, input)
                : await createCustomer(storeId, input);
        if (!res.ok) {
            if (res.field === "email")
                form.setError("email", { message: res.error });
            else showError(res.error);
            return;
        }
        showSuccess(editing ? "Details saved." : "Customer added.");
        // Editing stays on the customer; adding one opens them.
        if (editing) {
            router.refresh();
            onSaved?.();
        } else router.push(customerHref(storeId, res.data.id));
    }

    return (
        <Form {...form}>
            <>
                <FormSheetBody className="gap-4">
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
                                    <BusinessPhoneInput
                                        ref={field.ref}
                                        name={field.name}
                                        value={field.value ?? ""}
                                        onValueChange={field.onChange}
                                        onBlur={field.onBlur}
                                        disabled={isSubmitting}
                                    />
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
                                        <Input
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
                            name="state"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>State</FormLabel>
                                    <FormControl>
                                        <Input
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
                            name="country"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Country</FormLabel>
                                    <FormControl>
                                        <Input
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
                            name="zipCode"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Zip</FormLabel>
                                    <FormControl>
                                        <Input
                                            disabled={isSubmitting}
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                </FormSheetBody>
                <FormSheetFoot
                    saveLabel={editing ? "Save" : "Add customer"}
                    pending={isSubmitting}
                    onSubmit={(e) => form.handleSubmit(onSubmit)(e)}
                />
            </>
        </Form>
    );
}
