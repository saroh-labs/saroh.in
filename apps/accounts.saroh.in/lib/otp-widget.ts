import type { PhoneStart } from "./phone-sign-in";

/**
 * The OTP widget, driven by our own code step (DEC-196). The API names the
 * provider's script and config (`POST /account-phone/start`); this app
 * never does. With `exposeMethods: true` the widget draws no popup of its
 * own: it puts `sendOtp`, `retryOtp` and `verifyOtp` on `window`, and its
 * captcha goes in the element named by `captchaRenderId`.
 *
 * What the provider's docs leave open, read defensively here: the success
 * callback of `verifyOtp` is said to carry the access token, but not under
 * which name, so a bare string and `{ message }` (the usual shape) are both
 * read. Anything else is a failure, never a guess.
 *
 * Under the fake provider (development and test) the API answers a
 * stand-in token instead: nothing is sent, any 6 digits "verify", and the
 * API then checks the stand-in token exactly as it checks a real one.
 */
export interface OtpSender {
    /** Whether the provider's captcha has to be solved before a send. */
    captcha: boolean;
    send(): Promise<void>;
    retry(): Promise<void>;
    /** The access token for the API to check. */
    verify(code: string): Promise<string>;
}

/** The element the widget's captcha is drawn in. */
export const CAPTCHA_ELEMENT_ID = "saroh-otp-captcha";

type Callback = (data: unknown) => void;

interface WidgetWindow {
    initSendOTP?: (config: Record<string, unknown>) => void;
    sendOtp?: (identifier: string, ok: Callback, fail: Callback) => void;
    retryOtp?: (channel: string | null, ok: Callback, fail: Callback) => void;
    verifyOtp?: (otp: string, ok: Callback, fail: Callback) => void;
}

let loaded: Promise<void> | null = null;

function loadScript(src: string): Promise<void> {
    loaded ??= new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => {
            loaded = null;
            reject(new Error("widget failed to load"));
        };
        document.head.appendChild(script);
    });
    return loaded;
}

/** The token in `verifyOtp`'s answer: a string, or `{ message }`. */
export function tokenOf(data: unknown): string | null {
    if (typeof data === "string" && data) return data;
    if (data && typeof data === "object" && "message" in data) {
        const { message } = data;
        if (typeof message === "string" && message) return message;
    }
    return null;
}

/** Ready the widget (or the stand-in) for one number, E.164. */
export async function otpSender(
    start: PhoneStart,
    phoneE164: string,
): Promise<OtpSender> {
    if ("standIn" in start) {
        const { token } = start.standIn;
        return {
            captcha: false,
            send: () => Promise.resolve(),
            retry: () => Promise.resolve(),
            verify: (code) =>
                /^\d{6}$/.test(code)
                    ? Promise.resolve(token)
                    : Promise.reject(new Error("not six digits")),
        };
    }
    const { widgetId, tokenAuth, scriptUrl } = start.widget;
    await loadScript(scriptUrl);
    const w = window as unknown as WidgetWindow;
    if (!w.initSendOTP) throw new Error("widget did not start");
    w.initSendOTP({
        widgetId,
        tokenAuth,
        exposeMethods: true,
        captchaRenderId: CAPTCHA_ELEMENT_ID,
        success: () => undefined,
        failure: () => undefined,
    });
    // The provider wants the number with its country code, without "+".
    const identifier = phoneE164.replace(/\D/g, "");
    // A method the script failed to put on `window` fails at once, never hangs.
    const asPromise = (
        run: ((ok: Callback, fail: Callback) => void) | null,
    ): Promise<unknown> =>
        run
            ? new Promise((resolve, reject) => run(resolve, reject))
            : Promise.reject(new Error("widget method missing"));
    return {
        captcha: true,
        // Read off `window` at each call: the script may add them after init.
        send: async () => {
            const { sendOtp } = w;
            await asPromise(
                sendOtp ? (ok, fail) => sendOtp(identifier, ok, fail) : null,
            );
        },
        retry: async () => {
            const { retryOtp } = w;
            await asPromise(
                retryOtp ? (ok, fail) => retryOtp(null, ok, fail) : null,
            );
        },
        verify: async (code) => {
            const { verifyOtp } = w;
            const data = await asPromise(
                verifyOtp ? (ok, fail) => verifyOtp(code, ok, fail) : null,
            );
            const token = tokenOf(data);
            if (!token) throw new Error("no token in the widget's answer");
            return token;
        },
    };
}
