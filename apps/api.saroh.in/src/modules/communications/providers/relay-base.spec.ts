import type { Resolver } from "../../link-preview/ssrf-guard";
import { relayBase } from "./relay-base";

const to =
    (address: string): Resolver =>
    async () => [{ address, family: 4 }];

describe("a provider's relay address", () => {
    it("is the provider's own API when none is named", async () => {
        await expect(
            relayBase(undefined, "https://api.resend.com"),
        ).resolves.toBe("https://api.resend.com");
    });

    it("is kept when it is public https", async () => {
        await expect(
            relayBase("https://relay.example.com/", "", to("93.184.216.34")),
        ).resolves.toBe("https://relay.example.com");
    });

    it.each([
        ["plain http", "http://relay.example.com", "93.184.216.34"],
        [
            "the cloud metadata address",
            "https://169.254.169.254",
            "169.254.169.254",
        ],
        ["an internal name", "https://coolify:8000", "10.0.0.5"],
        [
            "a public name that points inside",
            "https://relay.example.com",
            "10.0.0.5",
        ],
        ["not an address", "relay", "93.184.216.34"],
    ])("is refused when it is %s", async (_, base, address) => {
        await expect(relayBase(base, "", to(address))).rejects.toThrow();
    });
});
