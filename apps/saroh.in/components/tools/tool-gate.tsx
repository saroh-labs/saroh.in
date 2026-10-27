"use client";

import type { GateResult } from "@saroh/search-pages";
import { ToolGateProvider } from "@saroh/search-pages";
import type { ReactNode } from "react";

import { unlockWithEmail } from "@/lib/qr-code-maker";

/** The unlock route's answer for this tool, as the shared gate reads it. */
export async function toolGateSubmit(
    email: string,
    /** The package tool's slug; the QR code maker sends none. */
    tool?: string,
): Promise<GateResult> {
    const body = await unlockWithEmail(email, tool);
    return body.unlocked
        ? { ok: true, emailed: body.emailed }
        : { ok: false, reason: body.failure };
}

/**
 * Every free tool's email gate on saroh.in (#1253): the unlock route, which
 * takes the email and this tool's slug (so the email links back to this
 * tool), and the Privacy page. Wraps a `<ToolPage>` drawn on the server.
 */
export function SiteToolGate({
    tool,
    children,
}: {
    tool: string;
    children: ReactNode;
}) {
    return (
        <ToolGateProvider
            onSubmit={(email) => toolGateSubmit(email, tool)}
            privacy="/privacy"
        >
            {children}
        </ToolGateProvider>
    );
}
