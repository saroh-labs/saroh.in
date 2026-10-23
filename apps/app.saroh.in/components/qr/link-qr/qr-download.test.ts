import { QR_EXPORT_SIZE, qrArt } from "@saroh/ui/lib/qr-art";
import { describe, expect, it } from "vitest";

import { code } from "@/lib/qr/fixtures.test-data";

import type { DownloadEnv } from "./qr-download";
import { artOf, downloadQr, qrFile, svgLogoOf } from "./qr-download";

const NO_LOGO = { dataUrl: null, initials: "GS" };
const LOGO = { dataUrl: "data:image/png;base64,iVBORw==", initials: "GS" };

describe("qrFile", () => {
    it("names the file for the business and the code", () => {
        const file = qrFile(code(), "Glow Studio", NO_LOGO);
        expect(file?.name).toBe("glow-studio-qr-h7c");
    });

    it("draws the saved code's own short link, in its saved look", () => {
        const saved = code({ color: "#1f4d3a", label: "Scan to book" });
        const file = qrFile(saved, "Glow Studio", NO_LOGO);
        // The same modules as the link drawn plain: nothing else is encoded.
        expect(file?.svg).toContain(qrArt(saved.link ?? "").dots);
        expect(file?.svg).toContain('fill="#1f4d3a"');
        expect(file?.svg).toContain("Scan to book");
        expect(file?.svg).toContain(`width="${QR_EXPORT_SIZE}"`);
        // A plain code carries no logo, whatever the business has.
        expect(qrFile(saved, "Glow Studio", LOGO)?.svg).not.toContain("<image");
    });

    it("puts the logo inside a branded file, or the initials without one", () => {
        const branded = code({ style: "BRANDED" });
        const withLogo = qrFile(branded, "Glow Studio", LOGO)?.svg ?? "";
        expect(withLogo).toContain(`href="${LOGO.dataUrl}"`);
        // Nothing in the file points outside it.
        expect(withLogo).not.toMatch(/href="https?:/);
        const initials = qrFile(branded, "Glow Studio", NO_LOGO)?.svg ?? "";
        expect(initials).toContain(">GS</text>");
        expect(initials).not.toContain("<image");
    });

    it("leaves the label out when the code has none", () => {
        const file = qrFile(code({ label: null }), "Glow Studio", NO_LOGO);
        expect(file?.svg).not.toContain("<text");
    });

    it("makes no file for a code with nothing to open", () => {
        expect(qrFile(code({ link: null }), "Glow Studio", NO_LOGO)).toBeNull();
    });

    it("draws plain as squares and branded as dots with the logo box", () => {
        expect(
            artOf("https://glow.saroh.app/q/h7c", "PLAIN").logoBox,
        ).toBeNull();
        expect(
            artOf("https://glow.saroh.app/q/h7c", "BRANDED").logoBox,
        ).not.toBeNull();
        expect(svgLogoOf("PLAIN", LOGO)).toBeUndefined();
        expect(svgLogoOf("BRANDED", LOGO)).toEqual({ dataUrl: LOGO.dataUrl });
        expect(svgLogoOf("BRANDED", NO_LOGO)).toEqual({ initials: "GS" });
    });
});

describe("downloadQr", () => {
    const file = { name: "glow-studio-qr-h7c", svg: "<svg/>" };
    const recorder = () => {
        const calls: string[] = [];
        const env: DownloadEnv = {
            rasterise: (svg, size) => {
                calls.push(`rasterise ${svg} ${size}`);
                return Promise.resolve(
                    new Blob(["png"], { type: "image/png" }),
                );
            },
            save: (blob, filename) => {
                calls.push(`save ${filename} ${blob.type}`);
            },
        };
        return { calls, env };
    };

    it("saves the SVG string as it is", async () => {
        const { calls, env } = recorder();
        await downloadQr(file, "svg", env);
        expect(calls).toEqual([
            "save glow-studio-qr-h7c.svg image/svg+xml;charset=utf-8",
        ]);
    });

    it("draws the PNG at 1200 from that same SVG", async () => {
        const { calls, env } = recorder();
        await downloadQr(file, "png", env);
        expect(calls).toEqual([
            "rasterise <svg/> 1200",
            "save glow-studio-qr-h7c.png image/png",
        ]);
    });
});
