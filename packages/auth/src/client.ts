"use client";

import { createAuthClient } from "better-auth/react";

/**
 * Shared Better Auth browser client. Auth now lives on api.saroh.in, so the
 * client is cross-origin from every frontend: point `NEXT_PUBLIC_BETTER_AUTH_URL`
 * at the api (it appends `/api/auth`) and send credentials so the browser
 * attaches the `.saroh.in` session cookie on every request.
 *
 * Milestone 1: core only. Plugin clients (emailOTP, admin, organization,
 * twoFactor, apiKey, …) are added alongside their M2 server slices.
 */
export const authClient = createAuthClient({
    baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
    fetchOptions: { credentials: "include" },
});

export const { signIn, signUp, signOut, useSession, getSession } = authClient;
