"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { authClient } from "@saroh/auth/client";
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
import { cn } from "@saroh/ui/lib/utils";
import { showError } from "@saroh/ui/toast";
import { Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { CountrySelect } from "@/components/shared/country-select";
import { accountsLoginUrl } from "@/lib/accounts";
import { checkAddress, createOrganization } from "@/lib/organizations/actions";
import {
    addressFromName,
    cleanAddressInput,
} from "@/lib/organizations/address";
import type { AddressAvailability } from "@/lib/organizations/service";

/**
 * The countries a merchant is most likely to be in, offered as chips, as the
 * design draws them. Any other is one tap further, through the full list —
 * the chips are a shortcut, never the limit of what can be chosen.
 */
const COMMON_COUNTRIES = [
    { code: "IN", name: "India" },
    { code: "AE", name: "UAE" },
    { code: "SG", name: "Singapore" },
    { code: "GB", name: "United Kingdom" },
    { code: "US", name: "United States" },
] as const;

/** The API's two business types, in the design's words. */
const TYPES = [
    {
        value: "individual",
        label: "Not registered",
        note: "Sole trader, freelancer, side project",
    },
    {
        value: "company",
        label: "Registered",
        note: "Pvt Ltd, LLP, partnership",
    },
] as const;

const formSchema = z.object({
    name: z.string().trim().min(1, { message: "The business needs a name" }),
    address: z
        .string()
        .min(3, { message: "An address needs at least 3 characters" }),
    type: z.enum(["individual", "company"]).optional(),
    country: z.string().length(2),
});

type FormValues = z.infer<typeof formSchema>;

/**
 * Setup's one step: name the business, reserve its address, and say the two
 * things invoices and payment providers need to know. Then Saroh opens.
 *
 * The address follows the name until the merchant edits it, and is checked as
 * they go — it is the one thing here that is hard to change later, because it
 * is where the business's website will live (`<address>.saroh.app`). The
 * rest of the business profile (legal name, tax ID, contact email, website)
 * is not asked here; Business settings has every one of those fields.
 */
export function BusinessSetupForm({
    email,
    backTo,
}: {
    /** Who is signed in — named beside the way out, so it is clear whose. */
    email: string;
    /** Where Back goes: the workspace, when they already have a business. */
    backTo?: string;
}) {
    const router = useRouter();
    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: "",
            address: "",
            type: undefined,
            country: "IN",
        },
    });
    const { isSubmitting } = form.formState;

    /** Whether the merchant has typed an address of their own. */
    const [edited, setEdited] = useState(false);
    const name = useWatch({ control: form.control, name: "name" });
    const address = useWatch({ control: form.control, name: "address" });
    const country = useWatch({ control: form.control, name: "country" });
    const [otherCountry, setOtherCountry] = useState(false);

    // The address follows the name until it is edited.
    useEffect(() => {
        if (!edited) {
            form.setValue("address", addressFromName(name), {
                shouldValidate: false,
            });
        }
    }, [name, edited, form]);

    /*
     * The live check. Debounced, and only the newest answer may land: a slow
     * answer for "rye" arriving after a fast one for "ryeandco" must not say
     * the wrong address is taken.
     */
    /** The last answer, or `unchecked` when the API could not be asked. */
    const [answer, setAnswer] = useState<
        AddressAvailability | { address: string; unchecked: true } | null
    >(null);
    const asked = useRef(0);
    useEffect(() => {
        if (address.length < 3) return;
        const ask = ++asked.current;
        const timer = setTimeout(() => {
            void checkAddress(address).then((next) => {
                if (ask !== asked.current) return;
                // Could not ask: say nothing rather than guess — the create
                // checks the address again either way.
                setAnswer(next ?? { address, unchecked: true });
            });
        }, 350);
        return () => clearTimeout(timer);
    }, [address]);

    /*
     * Derived, not stored: the answer is "checking" whenever it is about an
     * address other than the one in the field, so a stale answer can never be
     * shown against a new address.
     */
    const availability: AddressAvailability | "checking" | null =
        address.length < 3
            ? null
            : answer?.address !== address
              ? "checking"
              : "unchecked" in answer
                ? null
                : answer;

    const taken =
        availability !== null &&
        availability !== "checking" &&
        !availability.available;

    async function onSubmit(values: FormValues) {
        const res = await createOrganization({
            name: values.name.trim(),
            address: values.address,
            profile: {
                ...(values.type ? { type: values.type } : {}),
                country: values.country,
            },
        });
        if (!res.ok) {
            if (res.field === "name" || res.field === "address") {
                form.setError(res.field, { message: res.error });
            } else {
                showError(res.error);
            }
            return;
        }
        router.push("/");
        router.refresh();
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-5">
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>What is it called?</FormLabel>
                            <FormControl>
                                <Input
                                    placeholder="Rye & Co. Bakery"
                                    autoComplete="organization"
                                    {...field}
                                />
                            </FormControl>
                            <FormDescription>
                                Customers see this on receipts. You can change
                                it later.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Its address on Saroh</FormLabel>
                            {/* FormControl on the Input itself, so the label,
                                the description and any error are wired to the
                                field a screen reader lands on, not its frame. */}
                            <div
                                className={cn(
                                    "flex h-[38px] items-center rounded-md border border-input bg-field pr-3 font-mono text-sm focus-within:ring-2 focus-within:ring-ring",
                                    taken && "border-destructive",
                                )}
                            >
                                <FormControl>
                                    <Input
                                        {...field}
                                        onChange={(e) => {
                                            setEdited(true);
                                            field.onChange(
                                                cleanAddressInput(
                                                    e.target.value,
                                                ),
                                            );
                                        }}
                                        spellCheck={false}
                                        autoCapitalize="off"
                                        // The frame around it is the field;
                                        // the input itself is borderless so
                                        // the address and `.saroh.app` read
                                        // as one value.
                                        className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent pr-0 text-right font-mono shadow-none focus-visible:ring-0"
                                    />
                                </FormControl>
                                <span className="text-muted-foreground">
                                    .saroh.app
                                </span>
                            </div>
                            <p
                                id="address-status"
                                role="status"
                                className={cn(
                                    "min-h-[1.2em] text-[12px]",
                                    taken
                                        ? "text-destructive"
                                        : "text-muted-foreground",
                                )}
                            >
                                {availability === "checking" ? (
                                    "Checking…"
                                ) : availability?.available ? (
                                    <span className="inline-flex items-center gap-1 text-success">
                                        <Check
                                            aria-hidden
                                            className="size-3.5"
                                        />
                                        Free — your website will live here.
                                    </span>
                                ) : taken ? (
                                    availability.reason
                                ) : null}
                            </p>
                            <FormDescription>
                                {edited
                                    ? "Changing it later breaks saved links, so it is worth getting right now."
                                    : "Follows the name until you edit it. Changing it later breaks saved links, so it is worth getting right now."}
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel id="type-label">
                                Is it registered as a company?
                            </FormLabel>
                            <div
                                role="radiogroup"
                                aria-labelledby="type-label"
                                className="grid grid-cols-2 gap-2"
                            >
                                {TYPES.map((type) => {
                                    const on = field.value === type.value;
                                    return (
                                        <button
                                            key={type.value}
                                            type="button"
                                            role="radio"
                                            aria-checked={on}
                                            onClick={() =>
                                                field.onChange(
                                                    on ? undefined : type.value,
                                                )
                                            }
                                            className={cn(
                                                "rounded-lg border px-3.5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                                on
                                                    ? "border-foreground bg-muted"
                                                    : "border-input hover:bg-muted",
                                            )}
                                        >
                                            <span className="block text-[13px] font-semibold">
                                                {type.label}
                                            </span>
                                            <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
                                                {type.note}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                            <FormDescription>
                                It decides what your invoices say and what a
                                payment provider will ask you for.
                            </FormDescription>
                        </FormItem>
                    )}
                />

                <FormItem>
                    <FormLabel id="country-label">
                        Where does it trade?
                    </FormLabel>
                    <div
                        role="radiogroup"
                        aria-labelledby="country-label"
                        className="flex flex-wrap gap-1.5"
                    >
                        {COMMON_COUNTRIES.map((c) => {
                            const on = !otherCountry && country === c.code;
                            return (
                                <button
                                    key={c.code}
                                    type="button"
                                    role="radio"
                                    aria-checked={on}
                                    onClick={() => {
                                        setOtherCountry(false);
                                        form.setValue("country", c.code);
                                    }}
                                    className={cn(
                                        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                        on
                                            ? "border-foreground bg-foreground text-background"
                                            : "border-input hover:bg-muted",
                                    )}
                                >
                                    <span className="font-mono text-[11px] opacity-70">
                                        {c.code}
                                    </span>
                                    {c.name}
                                </button>
                            );
                        })}
                        <button
                            type="button"
                            role="radio"
                            aria-checked={otherCountry}
                            onClick={() => setOtherCountry(true)}
                            className={cn(
                                "inline-flex h-8 items-center rounded-full border px-3 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                otherCountry
                                    ? "border-foreground bg-foreground text-background"
                                    : "border-input hover:bg-muted",
                            )}
                        >
                            Another country
                        </button>
                    </div>
                    {otherCountry ? (
                        <CountrySelect
                            value={country}
                            onValueChange={(code) =>
                                form.setValue("country", code)
                            }
                            aria-describedby="country-note"
                        />
                    ) : null}
                    <FormDescription id="country-note">
                        Where the business is based. You can change it in
                        Business settings.
                    </FormDescription>
                </FormItem>

                <div className="flex gap-2 pt-1">
                    {backTo ? (
                        <Button asChild variant="outline" className="h-10">
                            <Link href={backTo}>Back</Link>
                        </Button>
                    ) : null}
                    <Button
                        type="submit"
                        className="wk-press h-10 flex-1 font-semibold"
                        disabled={isSubmitting || taken}
                        title={
                            taken && availability.reason
                                ? availability.reason
                                : undefined
                        }
                    >
                        {isSubmitting ? "Creating…" : "Create the business"}
                    </Button>
                </div>

                <p className="text-[12px] text-muted-foreground">
                    Signed in as{" "}
                    <span className="text-foreground">{email}</span> ·{" "}
                    <button
                        type="button"
                        className="text-foreground underline-offset-4 hover:underline"
                        onClick={() => {
                            void authClient.signOut().then(() => {
                                window.location.href = accountsLoginUrl;
                            });
                        }}
                    >
                        Sign out
                    </button>
                </p>
            </form>
        </Form>
    );
}
