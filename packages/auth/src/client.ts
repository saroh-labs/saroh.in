"use client";

import { createAuthClient } from "better-auth/react";

/**
 * Shared Better Auth browser client. Same-origin in the browser; set
 * `NEXT_PUBLIC_BETTER_AUTH_URL` only when calling a different domain.
 *
 * Milestone 1: core only. Plugin clients (emailOTP, admin, organization,
 * twoFactor, apiKey, …) are added alongside their M2 server slices.
 */
export const authClient = createAuthClient({
    baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
});

export const { signIn, signUp, signOut, useSession, getSession } = authClient;
