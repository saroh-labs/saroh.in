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
 * and lands on the account; the signed-in customer's initials, which open
 * it. The header's `account` slot (G17) draws it on every page of the site
 * while the account area is switched on.
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
            <Link
                href="/account"
                aria-label="My account"
                title="My account"
                className={cn(
                    "bg-site-fg text-site-bg inline-flex size-[38px] shrink-0 cursor-pointer items-center justify-center rounded-full text-xs font-bold hover:opacity-85 active:opacity-70",
                    focusRing,
                )}
            >
                {initials(customer.name, customer.email)}
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
                        router.push("/account");
                        router.refresh();
                    }}
                />
            ) : null}
        </>
    );
}
