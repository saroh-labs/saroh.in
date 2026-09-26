import { describe, expect, it } from "vitest";

import type { AlertMatrix } from "./preferences";
import { ALERTS, alertRows, getAlertPreferences } from "./preferences";

describe("alertRows", () => {
    it("draws every switch off and disabled until the API keeps them", async () => {
        const read = await getAlertPreferences();
        expect(read.status).toBe("not-available");
        const rows = alertRows(read);
        expect(rows.map((r) => r.label)).toEqual([
            "New order",
            "New booking",
            "Payment failed",
            "Someone joins the team",
            "Monday summary",
        ]);
        for (const row of rows) {
            expect(row.cells.map((c) => c.channel)).toEqual([
                "bell",
                "email",
                "whatsapp",
            ]);
            for (const cell of row.cells) {
                expect(cell).toMatchObject({ on: false, disabled: true });
                // Not "off": that would say what this person hears.
                expect(cell.label).toMatch(/can't be chosen yet$/);
            }
        }
        expect(rows[0]?.cells[1]?.label).toBe(
            "New order by Email, can't be chosen yet",
        );
    });

    it("reads the person's choices once there are some", () => {
        const alerts = Object.fromEntries(
            ALERTS.map((a) => [
                a.key,
                { bell: true, email: false, whatsapp: a.key === "failed" },
            ]),
        ) as AlertMatrix;
        const rows = alertRows({ status: "ok", alerts });
        const failed = rows.find((r) => r.key === "failed");
        expect(failed?.cells.map((c) => [c.on, c.disabled, c.label])).toEqual([
            [true, false, "Payment failed by Bell, on"],
            [false, false, "Payment failed by Email, off"],
            [true, false, "Payment failed by WhatsApp, on"],
        ]);
    });
});
