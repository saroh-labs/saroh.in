"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { createCustomer, updateCustomer } from "@/lib/customers/actions";
import type { Customer } from "@/lib/customers/service";

export function CustomerForm({
    storeId,
    customer,
}: {
    storeId: string;
    customer?: Customer;
}) {
    const router = useRouter();
    const editing = Boolean(customer);

    const [form, setForm] = useState({
        email: customer?.email ?? "",
        firstName: customer?.firstName ?? "",
        lastName: customer?.lastName ?? "",
        phone: customer?.phone ?? "",
        country: customer?.country ?? "",
        state: customer?.state ?? "",
        city: customer?.city ?? "",
        zipCode: customer?.zipCode ?? "",
    });
    const [emailError, setEmailError] = useState<string | undefined>();
    const [saving, setSaving] = useState(false);

    const set =
        (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
            setForm((f) => ({ ...f, [k]: e.target.value }));

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setEmailError(undefined);
        setSaving(true);
        const input = {
            email: form.email.trim(),
            firstName: form.firstName.trim() || null,
            lastName: form.lastName.trim() || null,
            phone: form.phone.trim() || null,
            country: form.country.trim() || null,
            state: form.state.trim() || null,
            city: form.city.trim() || null,
            zipCode: form.zipCode.trim() || null,
        };
        const res =
            editing && customer
                ? await updateCustomer(storeId, customer.id, input)
                : await createCustomer(storeId, input);
        setSaving(false);
        if (!res.ok) {
            if (res.field === "email") setEmailError(res.error);
            else toast.error(res.error);
            return;
        }
        toast.success(editing ? "Customer saved" : "Customer created");
        router.push(`/stores/${storeId}/customers`);
    }

    return (
        <form onSubmit={onSubmit} className="grid max-w-lg gap-4">
            <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={set("email")}
                    required
                    disabled={saving}
                />
                {emailError && (
                    <p className="text-sm text-destructive">{emailError}</p>
                )}
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                    <Label htmlFor="firstName">First name</Label>
                    <Input
                        id="firstName"
                        value={form.firstName}
                        onChange={set("firstName")}
                        disabled={saving}
                    />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="lastName">Last name</Label>
                    <Input
                        id="lastName"
                        value={form.lastName}
                        onChange={set("lastName")}
                        disabled={saving}
                    />
                </div>
            </div>
            <div className="grid gap-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                    id="phone"
                    value={form.phone}
                    onChange={set("phone")}
                    disabled={saving}
                />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                    <Label htmlFor="city">City</Label>
                    <Input
                        id="city"
                        value={form.city}
                        onChange={set("city")}
                        disabled={saving}
                    />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="state">State</Label>
                    <Input
                        id="state"
                        value={form.state}
                        onChange={set("state")}
                        disabled={saving}
                    />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="country">Country</Label>
                    <Input
                        id="country"
                        value={form.country}
                        onChange={set("country")}
                        disabled={saving}
                    />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="zipCode">Zip</Label>
                    <Input
                        id="zipCode"
                        value={form.zipCode}
                        onChange={set("zipCode")}
                        disabled={saving}
                    />
                </div>
            </div>
            <div>
                <Button type="submit" disabled={saving}>
                    {saving
                        ? "Saving…"
                        : editing
                          ? "Save changes"
                          : "Create customer"}
                </Button>
            </div>
        </form>
    );
}
