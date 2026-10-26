import type { Provider } from "@nestjs/common";

import { declaredNodeEnv, env } from "../../../env";
import { FakeOtpTransport } from "./fake-otp-transport";
import { Msg91OtpTransport } from "./msg91.provider";
import type { OtpTransport } from "./otp-transport.port";
import { OTP_TRANSPORT } from "./otp-transport.port";

/**
 * MSG91 when Saroh's credentials are all set; the fake only in a declared
 * development or test run without them. Anywhere else (production, or no
 * NODE_ENV given) it stays MSG91, so a send fails naming the missing variable
 * rather than quietly sending nothing.
 */
export function createOtpTransport(
    source: Pick<
        typeof env,
        | "MSG91_AUTH_KEY"
        | "MSG91_WHATSAPP_NUMBER"
        | "MSG91_WHATSAPP_TEMPLATE"
        | "MSG91_BASE_URL"
    >,
    nodeEnv: string | undefined,
): OtpTransport {
    const configured =
        source.MSG91_AUTH_KEY &&
        source.MSG91_WHATSAPP_NUMBER &&
        source.MSG91_WHATSAPP_TEMPLATE;
    if (!configured && (nodeEnv === "development" || nodeEnv === "test")) {
        return new FakeOtpTransport();
    }
    return new Msg91OtpTransport({
        authKey: source.MSG91_AUTH_KEY,
        whatsappNumber: source.MSG91_WHATSAPP_NUMBER,
        whatsappTemplate: source.MSG91_WHATSAPP_TEMPLATE,
        baseUrl: source.MSG91_BASE_URL,
    });
}

/** Nest provider exposing the {@link OtpTransport} under {@link OTP_TRANSPORT}. */
export const otpTransportProvider: Provider = {
    provide: OTP_TRANSPORT,
    useFactory: (): OtpTransport => createOtpTransport(env, declaredNodeEnv),
};
