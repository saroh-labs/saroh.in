import fs from "node:fs";
import path from "node:path";

import { doneLine, knowsDoneVerb } from "./tool-registry";

describe("an AI app's activity line (doneLine)", () => {
    it("says a tool's title as done, never the reply to the app", () => {
        expect(doneLine("Change a product")).toBe("Changed a product");
        expect(doneLine("Undo this conversation's website changes")).toBe(
            "Undid this conversation's website changes",
        );
        expect(doneLine("Look up a thing")).toBe("Look up a thing");
    });

    it("knows the verb of every tool that writes", () => {
        const dir = path.join(__dirname, "tools");
        const unknown: string[] = [];
        for (const file of fs.readdirSync(dir)) {
            if (!file.endsWith(".tools.ts")) continue;
            const src = fs.readFileSync(path.join(dir, file), "utf8");
            for (const m of src.matchAll(/title: "([^"]+)"/g)) {
                // The tool's hints follow its title in its definition.
                const after = src.slice(m.index, m.index + 800);
                const hints = /hints:\s*([A-Z_]+|\{[^}]*\})/.exec(after)?.[1];
                const readOnly =
                    hints === "READ_ONLY" ||
                    /readOnlyHint:\s*true/.test(hints ?? "");
                if (hints && !readOnly && !knowsDoneVerb(m[1])) {
                    unknown.push(`${file}: ${m[1]}`);
                }
            }
        }
        expect(unknown).toEqual([]);
    });
});
