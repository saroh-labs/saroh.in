import { Injectable } from "@nestjs/common";
import type { Edition } from "@saroh/edition";

/**
 * Sends a person a sign-in code the way the accounts sign-in does: through
 * the API's own Better Auth instance (`emailOTP`, type `sign-in`), so the
 * code is the library's, hashed at rest, single use and good for the same
 * ten minutes, and it signs in at accounts.saroh.in like any other. The
 * console never mails a code itself (admin console U9).
 *
 * Its own provider so a spec can see what was asked without a mailbox; the
 * mail itself goes through `auth.ts`'s sender, which a held address
 * (`sign-in-holds.ts`) never reaches.
 */
@Injectable()
export class SignInCodeSender {
    /**
     * `edition` picks the instance, and so the sender and the sign-in
     * address: a code sent from the Global console comes from saroh.tech
     * (KTD6). None: the configured instance.
     */
    async send(email: string, edition?: Edition | null): Promise<void> {
        // Loaded on first use, not at import: the admin controllers' specs
        // read route metadata under a CommonJS runner that cannot load
        // Better Auth (ESM), and this file is on their import path.
        const { authOfEdition } = await import("./auth");
        const auth = authOfEdition(edition);
        await (auth.api as unknown as CodeApi).sendVerificationOTP({
            body: { email, type: "sign-in" },
        });
    }
}

/**
 * The `emailOTP` endpoint, as a server call. `@saroh/auth` pins the
 * instance to Better Auth's general type (its doc says why), which names
 * only the core endpoints; the plugin's are there at run time.
 */
interface CodeApi {
    sendVerificationOTP(input: {
        body: { email: string; type: "sign-in" };
    }): Promise<unknown>;
}
