import type { Provider } from "@nestjs/common";
import { Logger } from "@nestjs/common";

import { declaredNodeEnv, env } from "../../../env";
import { FakeMessagingProvider } from "./fake-messaging-provider";
import type { MessagingProvider } from "./messaging-provider.port";
import { MESSAGING_PROVIDER } from "./messaging-provider.port";
import { MetaCloudProvider } from "./meta-cloud.provider";
import { Msg91Provider } from "./msg91.provider";

type Source = Pick<
    typeof env,
    | "MESSAGING_PROVIDER"
    | "MSG91_AUTH_KEY"
    | "MSG91_WHATSAPP_NUMBER"
    | "MSG91_WHATSAPP_TEMPLATE"
    | "MSG91_WHATSAPP_UTILITY_TEMPLATES"
    | "MSG91_BASE_URL"
    | "META_WA_PHONE_NUMBER_ID"
    | "META_WA_TOKEN"
    | "META_WA_TEMPLATE_LANG"
    | "META_GRAPH_BASE_URL"
>;

/**
 * `MESSAGING_PROVIDER` picks the adapter (`msg91`, `meta` or `fake`).
 * `meta` sends WhatsApp through Meta's Cloud API and keeps SMS and the OTP
 * widget on MSG91 (DEC-213). Unset: MSG91 when Saroh's credentials are all
 * set, the fake only in a declared development or test run without them.
 * The fake is never used outside development and test, even when asked
 * for: a send there fails naming the missing variable rather than quietly
 * sending nothing.
 */
export function createMessagingProvider(
    source: Source,
    nodeEnv: string | undefined,
): MessagingProvider {
    const devOrTest = nodeEnv === "development" || nodeEnv === "test";
    if (source.MESSAGING_PROVIDER === "fake") {
        if (devOrTest) return new FakeMessagingProvider();
        new Logger("MessagingProvider").error(
            "MESSAGING_PROVIDER=fake is refused outside development and test; using msg91",
        );
    }
    const configured =
        source.MSG91_AUTH_KEY &&
        source.MSG91_WHATSAPP_NUMBER &&
        source.MSG91_WHATSAPP_TEMPLATE;
    if (!source.MESSAGING_PROVIDER && !configured && devOrTest) {
        return new FakeMessagingProvider();
    }
    const msg91 = new Msg91Provider({
        authKey: source.MSG91_AUTH_KEY,
        whatsappNumber: source.MSG91_WHATSAPP_NUMBER,
        whatsappTemplate: source.MSG91_WHATSAPP_TEMPLATE,
        utilityTemplates: parseTemplateList(
            source.MSG91_WHATSAPP_UTILITY_TEMPLATES,
        ),
        baseUrl: source.MSG91_BASE_URL,
    });
    if (source.MESSAGING_PROVIDER !== "meta") return msg91;
    return new MetaCloudProvider(
        {
            phoneNumberId: source.META_WA_PHONE_NUMBER_ID,
            token: source.META_WA_TOKEN,
            // shortcut: Meta's template names come from the MSG91_* names, as they are the same WhatsApp account's templates; rename to provider-neutral names when MSG91's WhatsApp path is removed.
            authTemplate: source.MSG91_WHATSAPP_TEMPLATE,
            utilityTemplates: parseTemplateList(
                source.MSG91_WHATSAPP_UTILITY_TEMPLATES,
            ),
            templateLang: source.META_WA_TEMPLATE_LANG,
            baseUrl: source.META_GRAPH_BASE_URL,
        },
        msg91,
    );
}

/** `booking_confirmed=saroh_booking_v1,order_ready=saroh_order_ready` → a map. */
export function parseTemplateList(list?: string): Record<string, string> {
    const map: Record<string, string> = {};
    for (const pair of (list ?? "").split(",")) {
        const [key, name] = pair.split("=").map((s) => s.trim());
        if (key && name) map[key] = name;
    }
    return map;
}

/** Nest provider exposing the {@link MessagingProvider} under {@link MESSAGING_PROVIDER}. */
export const messagingProviderProvider: Provider = {
    provide: MESSAGING_PROVIDER,
    useFactory: (): MessagingProvider =>
        createMessagingProvider(env, declaredNodeEnv),
};
