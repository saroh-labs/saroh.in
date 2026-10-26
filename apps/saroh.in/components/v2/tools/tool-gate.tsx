"use client";

import type { GateResult } from "@saroh/search-pages";
import { ToolGateProvider } from "@saroh/search-pages";
import type { ReactNode } from "react";

import { unlockWithEmail } from "@/lib/qr-code-maker";

/** The QR code maker's unlock answer, as the shared gate reads it. */
export async function toolGateSubmit(email: string): Promise<GateResult> {
    const body = await unlockWithEmail(email);
    return body.unlocked
        ? { ok: true, emailed: body.emailed }
        : { ok: false, reason: body.failure };
}

/**
 * Every free tool's email gate on saroh.in (#1253): the QR code maker's
 * unlock route, which takes the email and nothing else, and the Privacy
 * page. Wraps a `<ToolPage>` drawn on the server.
 */
export function SiteToolGate({ children }: { children: ReactNode }) {
    return (
        <ToolGateProvider onSubmit={toolGateSubmit} privacy="/privacy">
            {children}
        </ToolGateProvider>
    );
}
