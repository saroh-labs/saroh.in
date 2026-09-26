"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@saroh/ui/button";
import { DatePicker } from "@saroh/ui/date-picker";
import {
    Form,
    FormCard,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@saroh/ui/form";
import { Input } from "@saroh/ui/input";
import { showError, showSuccess } from "@saroh/ui/toast";
import { ToggleGroup, ToggleGroupItem } from "@saroh/ui/toggle-group";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import type { MultiOption } from "@/components/shared/multi-select";
import { MultiSelect } from "@/components/shared/multi-select";
import { OptionSelect } from "@/components/shared/option-select";
import { SEGMENT, SEGMENTED } from "@/components/shared/segmented";
import { createDiscount, updateDiscount } from "@/lib/discounts/actions";
import type { Selections } from "@/lib/discounts/reach";
import {
    endOfDay,
    fromReach,
    NO_SELECTIONS,
    startOfDay,
    toReach,
} from "@/lib/discounts/reach";
import type {
    Discount,
    DiscountInput,
    DiscountReach,
} from "@/lib/discounts/service";

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AUD", "CAD", "SGD", "AED"];

const formSchema = z.object({
    code: z
        .string()
        .trim()
        .min(2, { message: "At least 2 characters" })
        .max(32)
        .regex(/^[A-Za-z0-9_-]+$/, {
            message: "Letters, digits, dashes or underscores — no spaces",
        }),
    description: z.string().max(200),
    kind: z.enum(["PERCENTAGE", "FIXED_AMOUNT"]),
    percent: z.string(),
    amount: z.string(),
    currency: z.string(),
    startsAt: z.date().optional(),
    endsAt: z.date().optional(),
    usageLimit: z
        .string()
        .regex(/^\d*$/, { message: "A whole number, or empty for no cap" }),
});

type FormValues = z.infer<typeof formSchema>;

/** The server's field names, onto the form's. */
const FIELD: Record<string, keyof FormValues | "targets"> = {
    code: "code",
    percent: "percent",
    amount: "amount",
    currency: "currency",
    endsAt: "endsAt",
    usageLimit: "usageLimit",
    targetIds: "targets",
};

const REACH: { value: DiscountReach; label: string }[] = [
    { value: "BUSINESS", label: "Everything" },
    { value: "STOREFRONT", label: "Storefronts" },
    { value: "COLLECTION", label: "Categories" },
    { value: "PRODUCT", label: "Products" },
];

const REACH_NOTE: Record<DiscountReach, string> = {
    BUSINESS: "Every order at every storefront.",
    STOREFRONT: "Every order at the storefronts you choose.",
    COLLECTION:
        "Only the lines in the categories you choose — and the categories inside them.",
    PRODUCT: "Only the lines for the products you choose.",
};

export interface ReachOptions {
    STOREFRONT: MultiOption[];
    COLLECTION: MultiOption[];
    PRODUCT: MultiOption[];
}

/**
 * Making or changing a discount code: what it takes off, what it applies to,
 * and when. Money is sent as the merchant typed it; the API works out every
 * amount and refuses what it cannot honour, and a refusal about one field
 * lands on that field.
 *
 * Ending a code is a date, not a deletion — an ended code keeps its figures.
 */
export function DiscountForm({
    discount,
    options,
    defaultCurrency,
}: {
    discount?: Discount;
    options: ReachOptions;
    defaultCurrency: string;
}) {
    const router = useRouter();
    const [mode, setMode] = useState<DiscountReach>(
        discount?.appliesTo ?? "BUSINESS",
    );
    const [picks, setPicks] = useState<Selections>(
        discount
            ? fromReach(
                  discount.appliesTo,
                  discount.targets.map((t) => t.id),
              )
            : NO_SELECTIONS,
    );
    const [targetsError, setTargetsError] = useState<string | null>(null);
    const [ending, startEnding] = useTransition();

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            code: discount?.code ?? "",
            description: discount?.description ?? "",
            kind: discount?.kind ?? "PERCENTAGE",
            percent: discount?.percent ?? "",
            amount: discount?.amount ?? "",
            currency: discount?.currency ?? defaultCurrency,
            startsAt: discount?.startsAt
                ? new Date(discount.startsAt)
                : undefined,
            endsAt: discount?.endsAt ? new Date(discount.endsAt) : undefined,
            usageLimit:
                discount?.usageLimit === undefined ||
                discount.usageLimit === null
                    ? ""
                    : String(discount.usageLimit),
        },
    });
    const kind = form.watch("kind");
    const { isSubmitting } = form.formState;

    async function onSubmit(values: FormValues) {
        setTargetsError(null);
        const reach = toReach(mode, picks);
        if (reach.appliesTo !== "BUSINESS" && reach.targetIds.length === 0) {
            setTargetsError("Choose at least one.");
            return;
        }
        const input: DiscountInput = {
            code: values.code.trim().toUpperCase(),
            description: values.description.trim() || null,
            kind: values.kind,
            ...(values.kind === "PERCENTAGE"
                ? { percent: values.percent.trim() }
                : {
                      amount: values.amount.trim(),
                      currency: values.currency,
                  }),
            ...reach,
            startsAt: values.startsAt ? startOfDay(values.startsAt) : null,
            endsAt: values.endsAt ? endOfDay(values.endsAt) : null,
            usageLimit: values.usageLimit ? Number(values.usageLimit) : null,
        };
        const res = discount
            ? await updateDiscount(discount.id, input)
            : await createDiscount(input);
        if (!res.ok) {
            const field = res.field ? FIELD[res.field] : undefined;
            if (field === "targets") setTargetsError(res.error);
            else if (field) form.setError(field, { message: res.error });
            else showError(res.error);
            return;
        }
        showSuccess(discount ? "Code saved" : `${res.data.code} is ready`);
        router.push("/commerce/discounts");
        router.refresh();
    }

    function endNow() {
        if (!discount) return;
        startEnding(async () => {
            const res = await updateDiscount(discount.id, {
                endsAt: new Date().toISOString(),
            });
            if (!res.ok) {
                showError(res.error);
                return;
            }
            showSuccess(`${discount.code} has ended — its figures are kept`);
            router.push("/commerce/discounts");
            router.refresh();
        });
    }

    const reachOptions = mode === "BUSINESS" ? [] : options[mode];

    return (
        <Form {...form}>
            <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="grid max-w-[620px] gap-4"
            >
                <FormCard>
                    <FormField
                        control={form.control}
                        name="code"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Code</FormLabel>
                                <FormControl>
                                    <Input
                                        {...field}
                                        onChange={(e) => {
                                            field.onChange(
                                                e.target.value.toUpperCase(),
                                            );
                                        }}
                                        placeholder="MARKETDAY"
                                        autoCapitalize="characters"
                                        spellCheck={false}
                                        className="font-mono uppercase"
                                    />
                                </FormControl>
                                <FormDescription>
                                    What a customer says or types. Letters,
                                    digits, dashes — each code once per
                                    business.
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
                                <FormLabel>Note (optional)</FormLabel>
                                <FormControl>
                                    <Input
                                        {...field}
                                        placeholder="Saturday market, autumn"
                                    />
                                </FormControl>
                                <FormDescription>
                                    For you and your team; customers never see
                                    it.
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </FormCard>

                <FormCard>
                    <FormField
                        control={form.control}
                        name="kind"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>What it takes off</FormLabel>
                                <ToggleGroup
                                    type="single"
                                    value={field.value}
                                    onValueChange={(v) => {
                                        if (v) field.onChange(v);
                                    }}
                                    aria-label="What it takes off"
                                    className={SEGMENTED}
                                >
                                    <ToggleGroupItem
                                        value="PERCENTAGE"
                                        className={SEGMENT}
                                    >
                                        A percentage
                                    </ToggleGroupItem>
                                    <ToggleGroupItem
                                        value="FIXED_AMOUNT"
                                        className={SEGMENT}
                                    >
                                        An amount
                                    </ToggleGroupItem>
                                </ToggleGroup>
                            </FormItem>
                        )}
                    />
                    {kind === "PERCENTAGE" ? (
                        <FormField
                            control={form.control}
                            name="percent"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Percentage off</FormLabel>
                                    <div className="relative w-32">
                                        <FormControl>
                                            <Input
                                                {...field}
                                                inputMode="decimal"
                                                placeholder="15"
                                                className="pr-7 tabular-nums"
                                            />
                                        </FormControl>
                                        <span
                                            aria-hidden
                                            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground"
                                        >
                                            %
                                        </span>
                                    </div>
                                    <FormDescription>
                                        Of what the code applies to, before tax
                                        and delivery.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    ) : (
                        <div className="flex flex-wrap items-start gap-3">
                            <FormField
                                control={form.control}
                                name="amount"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Amount off</FormLabel>
                                        <FormControl>
                                            <Input
                                                {...field}
                                                inputMode="decimal"
                                                placeholder="10.00"
                                                className="w-36 tabular-nums"
                                            />
                                        </FormControl>
                                        <FormDescription>
                                            Never more than what it applies to.
                                        </FormDescription>
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
                                                options={CURRENCIES.map(
                                                    (c) => ({
                                                        value: c,
                                                        label: c,
                                                    }),
                                                )}
                                                className="w-28 font-mono"
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                    )}
                </FormCard>

                <FormCard>
                    <div className="grid gap-2">
                        <span
                            id="discount-reach"
                            className="text-[12.5px] font-medium"
                        >
                            What it applies to
                        </span>
                        <ToggleGroup
                            type="single"
                            value={mode}
                            onValueChange={(v) => {
                                if (v) {
                                    setMode(v as DiscountReach);
                                    setTargetsError(null);
                                }
                            }}
                            aria-labelledby="discount-reach"
                            className={SEGMENTED}
                        >
                            {REACH.map((r) => (
                                <ToggleGroupItem
                                    key={r.value}
                                    value={r.value}
                                    className={SEGMENT}
                                >
                                    {r.label}
                                </ToggleGroupItem>
                            ))}
                        </ToggleGroup>
                        <p
                            id="discount-reach-note"
                            className="text-[11.5px] leading-[1.5] text-muted-foreground"
                        >
                            {REACH_NOTE[mode]}
                        </p>
                        {mode !== "BUSINESS" ? (
                            <>
                                <MultiSelect
                                    options={reachOptions}
                                    value={picks[mode]}
                                    onValueChange={(ids) => {
                                        setPicks((p) => ({
                                            ...p,
                                            [mode]: ids,
                                        }));
                                        setTargetsError(null);
                                    }}
                                    placeholder={
                                        mode === "STOREFRONT"
                                            ? "Choose storefronts"
                                            : mode === "COLLECTION"
                                              ? "Choose categories"
                                              : "Choose products"
                                    }
                                    searchPlaceholder="Search"
                                    emptyText={
                                        reachOptions.length === 0
                                            ? "There are none yet."
                                            : "Nothing by that name."
                                    }
                                    aria-describedby="discount-reach-note"
                                />
                                {targetsError ? (
                                    <p
                                        role="alert"
                                        className="text-[12px] font-medium text-destructive"
                                    >
                                        {targetsError}
                                    </p>
                                ) : null}
                            </>
                        ) : null}
                    </div>
                </FormCard>

                <FormCard>
                    <div className="flex flex-wrap gap-4">
                        <FormField
                            control={form.control}
                            name="startsAt"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Starts</FormLabel>
                                    <FormControl>
                                        <DatePicker
                                            value={field.value}
                                            onValueChange={field.onChange}
                                            placeholder="Straight away"
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="endsAt"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Ends</FormLabel>
                                    <div className="flex items-center gap-2">
                                        <FormControl>
                                            <DatePicker
                                                value={field.value}
                                                onValueChange={field.onChange}
                                                placeholder="No end date"
                                            />
                                        </FormControl>
                                        {field.value ? (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => {
                                                    field.onChange(undefined);
                                                }}
                                            >
                                                Clear
                                            </Button>
                                        ) : null}
                                    </div>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                    <FormField
                        control={form.control}
                        name="usageLimit"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>
                                    How many times it can be used
                                </FormLabel>
                                <FormControl>
                                    <Input
                                        {...field}
                                        inputMode="numeric"
                                        placeholder="No cap"
                                        className="w-36 tabular-nums"
                                    />
                                </FormControl>
                                <FormDescription>
                                    Across every order. Leave empty for no cap.
                                    {discount
                                        ? ` Used ${discount.used} ${discount.used === 1 ? "time" : "times"} so far.`
                                        : ""}
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </FormCard>

                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        type="submit"
                        disabled={isSubmitting || ending}
                        className="wk-press"
                    >
                        {isSubmitting
                            ? "Saving…"
                            : discount
                              ? "Save changes"
                              : "Create code"}
                    </Button>
                    {discount?.state === "ACTIVE" ? (
                        <Button
                            type="button"
                            variant="outline"
                            disabled={isSubmitting || ending}
                            onClick={endNow}
                        >
                            End it now
                        </Button>
                    ) : null}
                </div>
            </form>
        </Form>
    );
}
