"use client";

import type { ReactNode } from "react";
import { createContext, useContext } from "react";

import type { AdminCoupon, AdminPricing, StaffName } from "@/lib/pricing-types";

/**
 * What every Plans & modules tab may read besides the draft (plans catalogue
 * U6): the server's picture, coupons, what this operator may do, and where
 * the pricing page lives. Read with `usePlans()`; the draft itself is
 * `useDraft()`, and moving between tabs is `usePlansNav()`.
 */

export interface PlansAccess {
    /** `pricing:edit`: change the draft, discard it. */
    canEdit: boolean;
    /** `pricing:publish`: publish, cancel a schedule, roll back. */
    canPublish: boolean;
    /** `coupons:manage`: coupons apply as soon as they are saved. */
    canManageCoupons: boolean;
}

export interface PlansData {
    /** `GET /admin/pricing` as the page read it. */
    pricing: AdminPricing;
    /** `GET /admin/pricing/coupons`; null when it could not be read. */
    coupons: AdminCoupon[] | null;
    access: PlansAccess;
    /** The public site's origin, for the pricing page and its preview. */
    siteUrl: string;
    /** The operator, as the draft's editor list names them. */
    me: StaffName;
}

const PlansContext = createContext<PlansData | null>(null);

export function usePlans(): PlansData {
    const data = useContext(PlansContext);
    if (!data) throw new Error("usePlans is used outside PlansShell");
    return data;
}

export function PlansDataProvider({
    value,
    children,
}: {
    value: PlansData;
    children: ReactNode;
}) {
    return (
        <PlansContext.Provider value={value}>{children}</PlansContext.Provider>
    );
}
