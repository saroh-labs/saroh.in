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
import {
    kindDefaults,
    kindWords,
    ORGANIZATION_KINDS,
} from "@/lib/organizations/kind";
import type { AddressAvailability } from "@/lib/organizations/service";
import { browserZone } from "@/lib/organizations/time-zones";
import {
    startCheckoutAfterOnboarding,
    takeLaunchOfferAfterOnboarding,
} from "@/lib/saroh-billing/checkout-actions";

import { SetupKindChoice } from "./setup-kind-choice";

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

/**
 * Setup asks only whether the business is registered; Settings › Business
 * offers the six types (F10). Registered saves no type: "registered" is this
 * form's own value, sent as `registered: true`, so a Pvt Ltd, LLP or
 * partnership isn't guessed at. The take-money checklist then asks for the
 * real one before they go live (`ready.ts`).
 */
const TYPES = [
    {
        value: "individual",
        label: "Not registered",
        note: "Sole trader, freelancer, side project",
    },
    {
        value: "registered",
        label: "Registered",
        note: "Pvt Ltd, LLP, partnership",
    },
] as const;

const formSchema = z.object({
    // Nothing is chosen for them (DEC-070): the answer is theirs to give.
    kind: z.enum(ORGANIZATION_KINDS, {
        errorMap: () => ({ message: "Choose what you're setting up" }),
    }),
    name: z.string().trim().min(1, { message: "It needs a name" }),
    address: z
        .string()
        .min(3, { message: "An address needs at least 3 characters" }),
    type: z.enum(["individual", "registered"]).optional(),
    country: z.string().length(2),
});

type FormValues = z.infer<typeof formSchema>;

/**
 * Setup's one step: say what is being set up (DEC-070), name it, reserve its
 * address, and say the things invoices and payment providers need to know.
 * Then Saroh opens.
 *
 * "What are you setting up?" comes first, with nothing chosen. The rest of
 * the form appears once it is answered, on the same screen, and speaks in
 * that answer's words (`kindWords`). The answer changes words and defaults
 * only: every kind gets the same Saroh.
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
    checkout,
    invite,
    defaultName,
}: {
    /** Who is signed in — named beside the way out, so it is clear whose. */
    email: string;
    /** Where Back goes: the workspace, when they already have a business. */
    backTo?: string;
    /**
     * The paid plan picked on saroh.in (plan U27): once the business exists,
     * its checkout. Null: it starts on Free, as every business does.
     */
    checkout?: { plan: string; cycle: "month" | "year"; name: string } | null;
    /**
     * An opening-day invite's token (plan U31): once the business exists,
     * it takes the launch offer. It wins over `checkout`.
     */
    invite?: string | null;
    /** The name the business was listed under on the waitlist (U31). */
    defaultName?: string;
}) {
    const router = useRouter();
    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            kind: undefined,
            name: defaultName ?? "",
            address: "",
            type: undefined,
            country: "IN",
        },
    });
    const { isSubmitting } = form.formState;
    // Set up, and on the way to Home: the push takes a moment, and the
    // button stays "Setting up…" until the page goes (UX-076).
    const [leaving, setLeaving] = useState(false);
    const busy = isSubmitting || leaving;

    /** Whether the merchant has typed an address of their own. */
    const [edited, setEdited] = useState(false);
    const name = useWatch({ control: form.control, name: "name" });
    const address = useWatch({ control: form.control, name: "address" });
    const country = useWatch({ control: form.control, name: "country" });
    // Unanswered until they pick: the schema's type says what a valid
    // submit holds, not what the form holds before one.
    const kind = useWatch({ control: form.control, name: "kind" }) as
        FormValues["kind"] | undefined;
    const words = kindWords(kind);
    const defaults = kindDefaults(kind);
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
        // A site for my work is not asked (KTD-6), so it sends no type even
        // if one was picked under another answer first.
        const asked = kindDefaults(values.kind).asksRegistered;
        const zone = browserZone();
        const res = await createOrganization({
            name: values.name.trim(),
            kind: values.kind,
            address: values.address,
            profile: {
                // Registered leaves the type unset and says so (see TYPES).
                ...(asked && values.type === "individual"
                    ? { type: "individual", registered: false }
                    : {}),
                ...(asked && values.type === "registered"
                    ? { registered: true }
                    : {}),
                country: values.country,
                // The browser's zone (UX-008): the business's for a country
                // that keeps several; one that keeps one zone uses that.
                ...(zone ? { timezone: zone } : {}),
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
        if (invite) {
            // Where the waitlist entry is marked joined and the offer
            // starts; the API checks the invite against this account.
            const taken = await takeLaunchOfferAfterOnboarding(invite);
            if (!taken.ok) {
                showError(
                    `${values.name.trim()} is set up, but the launch offer isn't applied yet.`,
                    taken.error,
                );
            }
        } else if (checkout) {
            const started = await startCheckoutAfterOnboarding({
                plan: checkout.plan,
                cycle: checkout.cycle,
            });
            if (started.kind === "authorise") {
                // The provider's page, given once (U15). Leaving the app,
                // so the button stays "Setting up…" until the page goes.
                window.location.assign(started.url);
                await new Promise(() => undefined);
                return;
            }
            if (started.kind === "failed") {
                showError(
                    `${values.name.trim()} is set up, but ${checkout.name} isn't started yet.`,
                    started.error,
                );
            }
        }
        setLeaving(true);
        router.push("/");
        router.refresh();
    }

    return (
        <Form {...form}>
            <form
                onSubmit={form.handleSubmit(onSubmit)}
                className={cn(
                    "grid gap-5",
                    // Until the first question is answered, only it, the
                    // button and the way out show. Hidden rather than
                    // unmounted: what was typed survives a change of answer.
                    !kind && "[&>*:not([data-setup-kept])]:hidden",
                )}
            >
                <FormField
                    control={form.control}
                    name="kind"
                    render={({ field, fieldState }) => (
                        <FormItem data-setup-kept>
                            <FormLabel id="kind-label">
                                What are you setting up?
                            </FormLabel>
                            <SetupKindChoice
                                value={field.value}
                                onChange={(next) => {
                                    field.onChange(next);
                                    // What an unanswered submit said about
                                    // fields that were not on screen yet is
                                    // not news once they appear.
                                    form.clearErrors();
                                }}
                                labelledBy="kind-label"
                                describedBy={
                                    fieldState.error ? "kind-error" : undefined
                                }
                                invalid={Boolean(fieldState.error)}
                            />
                            {fieldState.error ? (
                                <p
                                    id="kind-error"
                                    role="alert"
                                    className="text-[0.8rem] font-medium text-destructive"
                                >
                                    {fieldState.error.message}
                                </p>
                            ) : null}
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel data-ph-unmask="">
                                {words.nameLabel}
                            </FormLabel>
                            <FormControl>
                                <Input
                                    placeholder={defaults.namePlaceholder}
                                    autoComplete="organization"
                                    {...field}
                                />
                            </FormControl>
                            <FormDescription>
                                People see this on your site and invoices. You
                                can change it later.
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
                                        Available. Your website will live here.
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

                {defaults.asksRegistered ? (
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
                                                        on
                                                            ? undefined
                                                            : type.value,
                                                    )
                                                }
                                                className={cn(
                                                    "rounded-lg border px-3.5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                                    on
                                                        ? "border-foreground bg-muted"
                                                        : "border-input hover:bg-muted active:bg-accent-active",
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
                ) : null}

                <FormItem>
                    <FormLabel id="country-label">
                        {kind === "BUSINESS"
                            ? "Where does it trade?"
                            : "Where are you based?"}
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
                                            : "border-input hover:bg-muted active:bg-accent-active",
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
                                    : "border-input hover:bg-muted active:bg-accent-active",
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
                        {kind === "BUSINESS"
                            ? "Where the business is based."
                            : "Where you work from."}{" "}
                        You can change it in Settings.
                    </FormDescription>
                </FormItem>

                <div data-setup-kept className="flex gap-2 pt-1">
                    {backTo ? (
                        <Button asChild variant="outline" className="h-10">
                            <Link href={backTo}>Back</Link>
                        </Button>
                    ) : null}
                    <Button
                        type="submit"
                        className="wk-press h-10 flex-1 font-semibold"
                        disabled={busy || taken}
                        title={
                            taken && availability.reason
                                ? availability.reason
                                : undefined
                        }
                    >
                        {busy
                            ? "Setting up…"
                            : kind === "BUSINESS"
                              ? "Create the business"
                              : "Set it up"}
                    </Button>
                </div>

                <p
                    data-setup-kept
                    className="text-[12px] text-muted-foreground"
                >
                    Signed in as{" "}
                    <span className="text-foreground">{email}</span> ·{" "}
                    <button
                        type="button"
                        className="text-foreground underline-offset-4 hover:underline active:text-muted-foreground"
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
