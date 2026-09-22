"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@saroh/ui/button";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@saroh/ui/form";
import { Input } from "@saroh/ui/input";
import { Textarea } from "@saroh/ui/textarea";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import type { MultiOption } from "@/components/shared/multi-select";
import { MultiSelect } from "@/components/shared/multi-select";
import { OptionSelect } from "@/components/shared/option-select";
import {
    createPack,
    setPackArchived,
    updatePack,
} from "@/lib/class-packs/actions";
import type { ClassPack } from "@/lib/class-packs/service";

const CURRENCIES = ["INR", "USD", "GBP", "EUR", "AED", "SGD", "AUD", "CAD"];

const whole = (message: string, min: number, max: number) =>
    z
        .string()
        .trim()
        .regex(/^\d{1,4}$/, message)
        .refine((v) => Number(v) >= min && Number(v) <= max, message);

const schema = z.object({
    name: z.string().trim().min(1, "Give the pack a name").max(120),
    description: z.string().max(500),
    credits: whole("A whole number of classes, from 1 to 500", 1, 500),
    validityDays: whole("A whole number of days, from 1 to 3650", 1, 3650),
    price: z
        .string()
        .trim()
        .regex(/^\d{1,9}(\.\d{1,2})?$/, "A price like 4000 or 4000.50"),
    currency: z.string().regex(/^[A-Z]{3}$/),
    serviceIds: z.array(z.string()).min(1, "Choose the classes it pays for"),
});
type Values = z.infer<typeof schema>;

const FIELDS = new Set<keyof Values>([
    "name",
    "description",
    "credits",
    "validityDays",
    "price",
    "currency",
    "serviceIds",
]);

/**
 * Make or change a class pack: N classes for a price, valid for D days, on
 * the services it names. A change to the classes, price or days reaches packs
 * sold from now on; what it is usable on applies to everyone holding one —
 * the API's rule, said here before it is saved.
 */
export function PackForm({
    pack,
    services,
    defaultCurrency,
}: {
    /** The pack being changed; absent for a new one. */
    pack?: ClassPack;
    services: MultiOption[];
    defaultCurrency: string;
}) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const form = useForm<Values>({
        resolver: zodResolver(schema),
        defaultValues: {
            name: pack?.name ?? "",
            description: pack?.description ?? "",
            credits: String(pack?.credits ?? 10),
            validityDays: String(pack?.validityDays ?? 90),
            price: pack?.price ?? "",
            currency: pack?.currency ?? defaultCurrency,
            serviceIds: pack?.services.map((s) => s.id) ?? [],
        },
    });
    const { isSubmitting } = form.formState;

    async function save(values: Values) {
        const input = {
            name: values.name,
            description: values.description.trim() || null,
            credits: Number(values.credits),
            validityDays: Number(values.validityDays),
            price: values.price,
            currency: values.currency,
            serviceIds: values.serviceIds,
        };
        const res = pack
            ? await updatePack(pack.id, input)
            : await createPack(input);
        if (!res.ok) {
            if (res.field && FIELDS.has(res.field as keyof Values)) {
                form.setError(res.field as keyof Values, {
                    message: res.error,
                });
            } else {
                showError(res.error);
            }
            return;
        }
        showSuccess(
            pack ? `${input.name} saved` : `${input.name} is ready to sell`,
        );
        router.push("/class-packs");
    }

    async function archive(next: boolean) {
        if (!pack) return;
        setBusy(true);
        const res = await setPackArchived(pack.id, next);
        setBusy(false);
        if (!res.ok) return showError(res.error);
        showSuccess(
            next
                ? `${pack.name} is archived — no new sales`
                : `${pack.name} is on sale again`,
        );
        router.push("/class-packs");
    }

    const holders = pack?.activeHolders ?? 0;

    return (
        <Form {...form}>
            <form
                onSubmit={form.handleSubmit(save)}
                className="grid max-w-[640px] gap-6"
            >
                {pack && pack.sold > 0 ? (
                    <p className="rounded-[10px] bg-muted/60 px-3.5 py-3 text-[12.5px] leading-[1.55] text-muted-foreground">
                        Classes, price and days reach packs sold from now on —
                        {holders > 0
                            ? ` the ${holders} ${holders === 1 ? "person" : "people"} holding one keep what they bought.`
                            : " the ones already sold keep what was bought."}{" "}
                        What it is usable on applies to every pack already sold
                        as well.
                    </p>
                ) : null}
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Name</FormLabel>
                            <FormControl>
                                <Input
                                    placeholder="10-class pack"
                                    maxLength={120}
                                    disabled={isSubmitting}
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                        control={form.control}
                        name="credits"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Classes</FormLabel>
                                <FormControl>
                                    <Input
                                        inputMode="numeric"
                                        disabled={isSubmitting}
                                        {...field}
                                    />
                                </FormControl>
                                <FormDescription>
                                    One comes off for each booking paid with it.
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="validityDays"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Valid for (days)</FormLabel>
                                <FormControl>
                                    <Input
                                        inputMode="numeric"
                                        disabled={isSubmitting}
                                        {...field}
                                    />
                                </FormControl>
                                <FormDescription>
                                    From the day it is sold. Unused classes stop
                                    then.
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-4">
                    <FormField
                        control={form.control}
                        name="price"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Price</FormLabel>
                                <FormControl>
                                    <Input
                                        inputMode="decimal"
                                        placeholder="4000"
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
                        name="currency"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Currency</FormLabel>
                                <FormControl>
                                    <OptionSelect
                                        value={field.value}
                                        onValueChange={field.onChange}
                                        disabled={isSubmitting}
                                        options={[
                                            field.value,
                                            ...CURRENCIES.filter(
                                                (c) => c !== field.value,
                                            ),
                                        ].map((c) => ({ value: c, label: c }))}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
                <FormField
                    control={form.control}
                    name="serviceIds"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Usable on</FormLabel>
                            <FormControl>
                                <MultiSelect
                                    options={services}
                                    value={field.value}
                                    onValueChange={field.onChange}
                                    disabled={isSubmitting}
                                    placeholder="Choose the classes it pays for"
                                    searchPlaceholder="Search services"
                                    emptyText="No service by that name."
                                />
                            </FormControl>
                            <FormDescription>
                                A booking on any of these can be paid with the
                                pack.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>
                                Notes{" "}
                                <span className="font-normal text-muted-foreground">
                                    (optional)
                                </span>
                            </FormLabel>
                            <FormControl>
                                <Textarea
                                    rows={2}
                                    maxLength={500}
                                    disabled={isSubmitting}
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <div className="flex flex-wrap items-center gap-3">
                    <Button type="submit" disabled={isSubmitting || busy}>
                        {isSubmitting
                            ? "Saving…"
                            : pack
                              ? "Save changes"
                              : "Make the pack"}
                    </Button>
                    {pack ? (
                        <Button
                            type="button"
                            variant="ghost"
                            disabled={isSubmitting || busy}
                            onClick={() =>
                                void archive(pack.status !== "ARCHIVED")
                            }
                        >
                            {pack.status === "ARCHIVED"
                                ? "Put it back on sale"
                                : "Archive"}
                        </Button>
                    ) : null}
                </div>
            </form>
        </Form>
    );
}
