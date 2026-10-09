"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { focusRing } from "../booking-flow/styles";
import { cn } from "../lib/utils";
import type { SignedInCustomer, SignInApi, SignInOptions } from "./api";
import { initials } from "./model";
import { buttonClasses } from "./parts";
import { SignInSheet } from "./sign-in-sheet";

/**
 * The site header's account entry (round-2 plan A, A5; the Customer Site
 * design's header): "Sign in" for a visitor, which opens the sign-in sheet
 * and lands on the account; the signed-in customer's initials and "My
 * account" (the words from 640px up), which open it. The header's
 * `account` slot (G17) draws it on every page of the site while the
 * account area is switched on. On the account's own sign-in
 * prompt ("page") a sign-in stays on the page that asked for it (UX-052).
 *
 * The sheet's options (the business's phone, whether a challenge is likely)
 * are read when "Sign in" is pressed, not on every page view — but the sheet
 * opens at once, on what the page already knows, and takes them when they
 * land (#838). Waiting for the read first left a second or more where the
 * press showed nothing, and whatever was typed then went nowhere.
 */
export function AccountEntry({
    customer,
    businessName,
    api,
    loadOptions,
    variant = "header",
}: {
    customer: SignedInCustomer | null;
    businessName: string;
    api: SignInApi;
    loadOptions: () => Promise<SignInOptions | null>;
    /** "page": the account's own sign-in prompt, a full button. */
    variant?: "header" | "page";
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [options, setOptions] = useState<SignInOptions | null>(null);

    if (customer) {
        return (
            // The initials alone were easy to miss as the way back to the
            // account: wider screens name it beside them; a phone keeps the
            // badge, and the name stays for a screen reader.
            <Link
                href="/account"
                title="My account"
                className={cn(
                    "text-site-fg inline-flex h-[38px] shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold hover:bg-[color-mix(in_srgb,hsl(var(--site-fg))_6%,transparent)] active:opacity-70 sm:pr-3",
                    focusRing,
                )}
            >
                <span
                    aria-hidden
                    className="bg-site-fg text-site-bg inline-flex size-[38px] shrink-0 items-center justify-center rounded-full text-xs font-bold"
                >
                    {initials(customer.name, customer.email)}
                </span>
                <span className="sr-only sm:not-sr-only">My account</span>
            </Link>
        );
    }

    function openSheet() {
        setOpen(true);
        // Read afresh on every open: whether a challenge is likely changes.
        // Until it lands the sheet goes without the phone line; a challenge
        // it missed, the API asks for when the code is requested.
        void loadOptions()
            .then((loaded) => {
                if (loaded) setOptions(loaded);
            })
            .catch(() => undefined);
    }

    return (
        <>
            <button
                type="button"
                onClick={openSheet}
                className={
                    variant === "page"
                        ? buttonClasses(true)
                        : cn(
                              "text-site-fg h-[38px] shrink-0 cursor-pointer whitespace-nowrap rounded-full px-3 text-sm font-semibold hover:bg-[color-mix(in_srgb,hsl(var(--site-fg))_6%,transparent)] active:opacity-70",
                              focusRing,
                          )
                }
            >
                Sign in
            </button>
            {open ? (
                <SignInSheet
                    open
                    onClose={() => setOpen(false)}
                    options={
                        options ?? {
                            businessName,
                            phone: null,
                            challenge: { required: false, siteKey: null },
                        }
                    }
                    api={api}
                    onSignedIn={() => {
                        // The account's own prompt keeps the page that
                        // asked (UX-052): signed out on /account/plan, they
                        // land on their plan. The header's entry opens
                        // the account.
                        if (variant !== "page") router.push("/account");
                        router.refresh();
                    }}
                />
            ) : null}
        </>
    );
}
