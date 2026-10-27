/**
 * The Wi-Fi QR code (design WifiQr*.dc.html): the join-network string every
 * phone camera reads, `WIFI:T:WPA;S:<name>;P:<password>;H:false;;`. A \ ; ,
 * : or " in the name or password is escaped with a backslash. WPA3 is
 * `T:SAE`; an open network is `T:nopass` with no password. Pure, so a test
 * pins it and reads the drawn code back.
 */

export const SECURITY = [
    { value: "WPA", label: "WPA or WPA2" },
    { value: "SAE", label: "WPA3" },
    { value: "nopass", label: "No password" },
] as const;

export type Security = (typeof SECURITY)[number]["value"];

/** A backslash before each character the format reserves. */
export const escapeWifi = (v: string) => v.replace(/([\\;,:"])/g, "\\$1");

export interface WifiInput {
    ssid: string;
    password: string;
    security: Security;
    hidden: boolean;
}

export function wifiPayload(i: WifiInput): string {
    const pw = i.security === "nopass" ? "" : `P:${escapeWifi(i.password)};`;
    return `WIFI:T:${i.security};S:${escapeWifi(i.ssid)};${pw}H:${i.hidden};;`;
}

/** WPA personal passwords are 8 to 63 characters; phones refuse others. */
export function passwordProblem(i: WifiInput): string | null {
    if (i.security === "nopass") return null;
    const n = [...i.password].length;
    if (n >= 8 && n <= 63) return null;
    return `WPA passwords are 8 to 63 characters. This one has ${n}, so phones would refuse it.`;
}

/** Network names are at most 32 bytes. */
export const ssidTooLong = (ssid: string) =>
    new TextEncoder().encode(ssid).length > 32;

export const WORDS = {
    form: "Your Wi-Fi",
    ssid: "Network name",
    ssidHint:
        "Exactly as it shows in your phone's Wi-Fi list, capitals and spaces included.",
    ssidLong:
        "Wi-Fi names are at most 32 characters. Check it in your phone's Wi-Fi list.",
    password: "Password",
    passwordHint:
        "It never leaves this page. The code is drawn in your browser.",
    hide: "Hide",
    show: "Show",
    security: "Security",
    securityHint:
        "Most shop routers use WPA2. It's on the router's sticker or settings page.",
    hidden: "The network is hidden",
    printPassword: "Print the password on the card",
    printPasswordHint: "For guests whose phone camera can't read Wi-Fi codes.",
    open: "Anyone nearby can join an open network. The card will say No password needed.",
    eyebrow: "Scan to join the Wi-Fi",
    title: "Free Wi-Fi for guests",
    check: "Point your phone camera at the code and tap Join. Works on iPhone and Android.",
    noPassword: "No password needed",
    sample: "A sample. Type your network name to make yours.",
    gate: "Get your Wi-Fi card",
    gateButton: "Get my card",
    after: "You get a PNG of the code and the card to print or save as a PDF. The link we email doesn't hold your password; you type it again on this page.",
    png: "Download PNG",
    print: "Print the Wi-Fi card",
} as const;
