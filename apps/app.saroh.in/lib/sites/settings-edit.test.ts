import { describe, expect, it } from "vitest";

import {
    groupOfSheet,
    SETTINGS_SHEETS,
    settingsEditHref,
    settingsEditId,
    settingsSheetFromHash,
    settingsSheetFromParam,
} from "./settings-edit";
import { SETTINGS_GROUPS } from "./settings-page";

describe("the settings' sheets, by link", () => {
    it("reads a sheet from ?edit=, and nothing from anything else", () => {
        expect(settingsSheetFromParam("menu")).toBe("menu");
        expect(settingsSheetFromParam("sells-from")).toBe("sells-from");
        expect(settingsSheetFromParam("everything")).toBeNull();
        expect(settingsSheetFromParam("")).toBeNull();
        expect(settingsSheetFromParam(null)).toBeNull();
    });

    it("puts every sheet in a group the screen has", () => {
        const groups = SETTINGS_GROUPS.map((g) => g.id);
        for (const sheet of SETTINGS_SHEETS) {
            expect(groups).toContain(groupOfSheet(sheet));
        }
        expect(groupOfSheet("image")).toBe("search-and-sharing");
        expect(groupOfSheet("posts-path")).toBe("menu-and-footer");
        expect(groupOfSheet("domain")).toBe("address");
    });

    it("opens Sells from for the readiness step's anchor, and nothing else", () => {
        expect(settingsSheetFromHash("#sells-from")).toBe("sells-from");
        expect(settingsSheetFromHash("#settings-menu")).toBeNull();
        expect(settingsSheetFromHash("")).toBeNull();
    });

    it("writes a link that lands on the row's group with its sheet open", () => {
        expect(settingsEditHref("site_1", "menu")).toBe(
            "/sites/site_1/settings?section=menu-and-footer&edit=menu",
        );
        expect(settingsEditHref("site_1", "sells-from")).toBe(
            "/sites/site_1/settings?section=shop&edit=sells-from",
        );
        // Address is the screen's own address: no section to name.
        expect(settingsEditHref("site_1", "domain")).toBe(
            "/sites/site_1/settings?edit=domain",
        );
    });

    it("names each row's Edit after its row", () => {
        expect(settingsEditId("title")).toBe("settings-title-edit");
        expect(settingsEditId("sells-from")).toBe("sells-from-edit");
    });
});
