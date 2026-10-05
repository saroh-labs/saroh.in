// The pay link's limits count the visitor, not saroh.app's server: every
// visitor's call reaches the API from that one server, so keyed on the
// caller's address one busy business's customers would share one limit.
import { hashClientIp } from "../../common/client-ip";
import { signSiteRelay } from "../site-accounts/site-relay";
import { siteRelaySecret } from "../site-accounts/site-secrets";
import type { PublicInvoicePdfService } from "./public-invoice-pdf.service";
import { PublicInvoicesController } from "./public-invoices.controller";
import type { PublicInvoicesService } from "./public-invoices.service";

const SERVER = "10.0.0.5";
const VISITOR = "203.0.113.7";

function controller() {
    const read = jest.fn().mockResolvedValue({});
    const pdf = jest
        .fn()
        .mockResolvedValue({ file: Buffer.from("%PDF"), fileName: "x.pdf" });
    const c = new PublicInvoicesController(
        { read } as unknown as PublicInvoicesService,
        { pdf } as unknown as PublicInvoicePdfService,
    );
    return { c, read, pdf };
}

describe("PublicInvoicesController — whose limit a call counts against", () => {
    it("a signed relay counts the visitor it names", async () => {
        const { c, read } = controller();
        const relay = signSiteRelay(
            { address: VISITOR, host: "rye.saroh.app" },
            siteRelaySecret(),
        );
        await c.read("tok", SERVER, relay);
        expect(read).toHaveBeenCalledWith("tok", hashClientIp(VISITOR));
    });

    it("the PDF counts the visitor too", async () => {
        const { c, pdf } = controller();
        const relay = signSiteRelay(
            { address: VISITOR, host: "rye.saroh.app" },
            siteRelaySecret(),
        );
        await c.pdf("tok", SERVER, relay);
        expect(pdf).toHaveBeenCalledWith("tok", hashClientIp(VISITOR));
    });

    it("no relay, or a forged one, counts the caller", async () => {
        const { c, read } = controller();
        await c.read("tok", SERVER, undefined);
        const forged = signSiteRelay(
            { address: VISITOR, host: "rye.saroh.app" },
            "not-the-secret-not-the-secret-not-the-secret",
        );
        await c.read("tok", SERVER, forged);
        expect(read).toHaveBeenNthCalledWith(1, "tok", hashClientIp(SERVER));
        expect(read).toHaveBeenNthCalledWith(2, "tok", hashClientIp(SERVER));
    });
});
