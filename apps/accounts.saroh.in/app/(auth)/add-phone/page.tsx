import { resolveServerSession } from "@saroh/auth/next";
import { SplitPanel, SplitShell } from "@saroh/ui/split-shell";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AddPhoneStep } from "@/components/auth/add-phone-step";
import { PHONE_STEP_PANEL } from "@/components/auth/panel-copy";
import { isStaff } from "@/lib/businesses";
import { phoneOptions } from "@/lib/phone-sign-in";
import { PHONE_STEP_PATH, phoneStepVerdict } from "@/lib/phone-step";
import { defaultDestination, signedInDestination } from "@/lib/return-to";

export const metadata: Metadata = {
    title: "Add your phone",
    description: "Add a phone to your Saroh account.",
};

/**
 * "Add your phone" (DEC-196): where every sign-in and sign-up lands first
 * while `PHONE_REQUIRED_FOR_ACCOUNTS` is on (`lib/phone-step.ts`). Decided
 * here, on the server, from the API's switch and the session's verified
 * phone: anyone who need not stop goes straight on to `?to=`.
 *
 * Never a trap. Saroh's staff pass. While codes can't be sent the API says
 * `available: false` (and logs it) and this passes too, asking again at the
 * next sign-in. The step itself offers Sign out, and "Continue for now"
 * once a send fails because the provider is down.
 */
export default async function AddPhonePage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const { to } = await searchParams;
    const destination = signedInDestination(to);
    // A `to` back at this page would loop: go on to Saroh instead.
    const onward =
        new URL(destination, "https://accounts.invalid").pathname ===
        PHONE_STEP_PATH
            ? defaultDestination()
            : destination;

    const session = await resolveServerSession(await headers());
    if (session.status === "anonymous") {
        redirect(
            `/login?${new URLSearchParams({ redirect: onward }).toString()}`,
        );
    }
    // Can't tell who this is: never hold anyone at a step for our fault.
    if (session.status === "unavailable") redirect(onward);

    const options = await phoneOptions();
    const { user } = session.session;
    const verdict = phoneStepVerdict({
        required: options.required,
        available: options.available,
        phoneVerified: !!user.phoneVerifiedAt,
        // Asked only when it could matter: one more call, not every sign-in.
        staff:
            options.required && !user.phoneVerifiedAt ? await isStaff() : false,
    });
    if (verdict !== "ask") redirect(onward);

    return (
        <SplitShell panel={<SplitPanel {...PHONE_STEP_PANEL} />}>
            <AddPhoneStep
                destination={onward}
                turnstileSiteKey={options.turnstileSiteKey}
                whatsapp={options.whatsapp}
                sms={options.sms}
            />
        </SplitShell>
    );
}
