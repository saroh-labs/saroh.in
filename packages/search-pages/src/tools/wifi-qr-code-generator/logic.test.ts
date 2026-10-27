import { describe, expect, it } from "vitest";

import { decodeQr } from "../../test-qr";
import { escapeWifi, passwordProblem, ssidTooLong, wifiPayload } from "./logic";

// The boards' sample: Pulse Gym's guest network.
const PULSE = {
    ssid: "Pulse Gym Guest",
    password: "pulsegym2026",
    security: "WPA",
    hidden: false,
} as const;

describe("wifiPayload", () => {
    it("writes the board's sample in the standard form", () => {
        expect(wifiPayload(PULSE)).toBe(
            "WIFI:T:WPA;S:Pulse Gym Guest;P:pulsegym2026;H:false;;",
        );
    });

    it('escapes \\ ; , : and " in the name and password', () => {
        expect(escapeWifi('a\\b;c,d:e"f')).toBe('a\\\\b\\;c\\,d\\:e\\"f');
        expect(
            wifiPayload({ ...PULSE, ssid: "Café; 2G", password: 'p:a,s"s\\1' }),
        ).toBe('WIFI:T:WPA;S:Café\\; 2G;P:p\\:a\\,s\\"s\\\\1;H:false;;');
    });

    it("writes WPA3, open and hidden networks", () => {
        expect(wifiPayload({ ...PULSE, security: "SAE" })).toBe(
            "WIFI:T:SAE;S:Pulse Gym Guest;P:pulsegym2026;H:false;;",
        );
        expect(
            wifiPayload({ ...PULSE, security: "nopass", hidden: true }),
        ).toBe("WIFI:T:nopass;S:Pulse Gym Guest;H:true;;");
    });

    it("draws a code a camera reads back as the same string", () => {
        const s = wifiPayload({ ...PULSE, password: "a;b:c,d" });
        expect(decodeQr(s)).toBe(s);
    });
});

describe("passwordProblem", () => {
    it("asks for 8 to 63 characters, unless the network is open", () => {
        expect(passwordProblem({ ...PULSE, password: "pulse6" })).toBe(
            "WPA passwords are 8 to 63 characters. This one has 6, so phones would refuse it.",
        );
        expect(passwordProblem(PULSE)).toBeNull();
        expect(passwordProblem({ ...PULSE, password: "x".repeat(64) })).toMatch(
            /has 64/,
        );
        expect(
            passwordProblem({ ...PULSE, security: "nopass", password: "" }),
        ).toBeNull();
    });

    it("knows a name too long for Wi-Fi", () => {
        expect(ssidTooLong("Pulse Gym Guest")).toBe(false);
        expect(ssidTooLong("x".repeat(33))).toBe(true);
    });
});
