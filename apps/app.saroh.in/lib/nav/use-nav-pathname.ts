"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import type { NavGroup } from "@/components/shared/navigation/nav-items";
import {
    hasNavHome,
    navPathname,
} from "@/components/shared/navigation/nav-items";

/**
 * The last page this tab was on that is a row's own (not a person page or
 * another page `navPathname` gives a home). Browser memory only: written
 * in an effect, so the server and the first paint after a reload both read
 * null and agree.
 */
let lastOwnPage: string | null = null;

/** Where the person came from to reach a homed page; null when unknown. */
export function cameFrom(): string | null {
    return lastOwnPage;
}

/**
 * The address the rail and the tab bar mark (`navPathname`), knowing where
 * the person came from: a customer opened from Customers keeps Customers
 * lit (DEC-264).
 */
export function useNavPathname(groups: readonly NavGroup[]): string {
    const pathname = usePathname();
    useEffect(() => {
        if (!hasNavHome(pathname)) lastOwnPage = pathname;
    }, [pathname]);
    return navPathname(pathname, groups, lastOwnPage);
}
