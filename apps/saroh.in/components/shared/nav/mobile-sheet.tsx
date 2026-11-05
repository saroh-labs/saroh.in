"use client";

import { ButtonLink, buttonClasses } from "@saroh/marketing/button";
import { cn } from "@saroh/marketing/cn";
import { PhoneSheet } from "@saroh/marketing/phone-sheet";
import type { ComponentProps } from "react";

import type { Visitor } from "@/lib/browser/session";
import {
    ACCOUNT_URL,
    DASHBOARD_URL,
    LAUNCH_MODE,
    SIGN_IN_URL,
} from "@/lib/links";

import { CtaLink } from "../buttons/cta-link";
import { ABOUT_LINKS } from "./nav-section";

/**
 * saroh.in's phone sheet (`MobileMenu`): the shared `PhoneSheet` with this
 * site's launch switch and, at its foot, its own Sign in and start button or
 * the visitor. In its own file so it is fetched on the first tap of Menu, not
 * with every page.
 */
export function MobileSheet({
    visitor = null,
    onSignOut,
    onClose,
    ...menus
}: Omit<
    ComponentProps<typeof PhoneSheet>,
    "aboutLinks" | "pricing" | "actions"
> & {
    /** Signed in: who, in place of Sign in, and "Open dashboard". */
    visitor?: Visitor | null;
    onSignOut?: () => void;
}) {
    return (
        <PhoneSheet
            {...menus}
            onClose={onClose}
            aboutLinks={ABOUT_LINKS}
            pricing={LAUNCH_MODE === "open"}
            actions={
                visitor ? (
                    <>
                        {/* Masked in a session recording. */}
                        <div data-ph-mask="" className="grid gap-0.5 pb-1">
                            <span className="truncate text-lg font-semibold">
                                {visitor.name}
                            </span>
                            <span className="truncate text-mk-note text-muted-foreground">
                                {visitor.email}
                            </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2.5">
                            <ButtonLink
                                href={ACCOUNT_URL}
                                variant="secondary"
                                className="w-full"
                            >
                                Account
                            </ButtonLink>
                            <button
                                type="button"
                                onClick={onSignOut}
                                className={cn(
                                    buttonClasses({
                                        variant: "secondary",
                                    }),
                                    "w-full cursor-pointer bg-transparent",
                                )}
                            >
                                Sign out
                            </button>
                        </div>
                        <ButtonLink href={DASHBOARD_URL} className="w-full">
                            Open dashboard
                        </ButtonLink>
                    </>
                ) : (
                    <>
                        {LAUNCH_MODE === "open" ? (
                            <ButtonLink
                                href={SIGN_IN_URL}
                                variant="secondary"
                                className="w-full"
                            >
                                Sign in
                            </ButtonLink>
                        ) : null}
                        <CtaLink
                            src="nav-sheet"
                            onNavigate={onClose}
                            className="w-full"
                        />
                    </>
                )
            }
        />
    );
}
