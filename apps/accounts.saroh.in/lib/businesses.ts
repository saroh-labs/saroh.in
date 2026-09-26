import { headers } from "next/headers";

import { env } from "@/env";

import { getAppUrl } from "./app-urls";

/**
 * A person's businesses and their place in each, read for "Your businesses".
 * Server-only: it forwards the visitor's own session cookie, so the API
 * answers for them and nobody else.
 */

export type BuiltInRole = "OWNER" | "ADMIN" | "MEMBER" | "REVIEWER";

export interface Business {
    id: string;
    name: string;
    slug: string;
    role: BuiltInRole;
    /** A role the business invented, in its own words; null for a built-in. */
    roleLabel: string | null;
    lifecycleStatus: string;
}

function apiBase(): string {
    if (env.NEXT_PUBLIC_BETTER_AUTH_URL) {
        return new URL(env.NEXT_PUBLIC_BETTER_AUTH_URL).origin;
    }
    return env.NODE_ENV === "production"
        ? "https://api.saroh.in"
        : "https://api.saroh.localhost";
}

async function apiGet(path: string): Promise<Response> {
    const cookie = (await headers()).get("cookie") ?? "";
    return fetch(`${apiBase()}${path}`, {
        headers: { cookie },
        cache: "no-store",
    });
}

/** Their businesses, by name. Throws when the API cannot answer. */
export async function listBusinesses(): Promise<Business[]> {
    const res = await apiGet("/organizations");
    if (!res.ok) throw new Error(`GET /organizations failed: ${res.status}`);
    return (await res.json()) as Business[];
}

/**
 * Whether this person runs the instance too. Only the API can say; a refusal
 * is simply "no", and an outage leaves the console off the list rather than
 * failing the page.
 */
export async function isStaff(): Promise<boolean> {
    try {
        const res = await apiGet("/admin/me");
        return res.ok;
    } catch {
        return false;
    }
}

/**
 * Where to open a business: the workspace's own door, which checks the person
 * belongs to it and remembers the choice (`app.saroh.in/open/:id`).
 */
export function openBusinessUrl(id: string): string {
    return `${getAppUrl()}/open/${encodeURIComponent(id)}`;
}

/**
 * The instance's console, worked out from the workspace's address — every
 * app is its hostname's first label on one domain (DEC-002).
 */
export function consoleUrl(): string {
    const app = new URL(getAppUrl());
    const [, ...rest] = app.hostname.split(".");
    return `${app.protocol}//admin.${rest.join(".")}`;
}

export const ROLE_LABEL: Record<BuiltInRole, string> = {
    OWNER: "Owner",
    ADMIN: "Admin",
    MEMBER: "Member",
    REVIEWER: "Reviewer",
};

/** What each built-in role may do, in words, for the line under a business. */
export const ROLE_SHORT: Record<BuiltInRole, string> = {
    OWNER: "Can do everything, including billing and who has access",
    ADMIN: "Can change the business and invite people",
    MEMBER: "Can see the business's work; changes little",
    REVIEWER: "Can read and comment on the pages they were invited to",
};
