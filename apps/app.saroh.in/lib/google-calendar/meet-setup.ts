import { readGoogleCalendar } from "./service";
import type { MeetSetup } from "./types";

/**
 * Google Meet's part in a service's Where (DEC-233): null unless Google
 * Calendar is on for the business, its plan has it and Google is set up.
 */
export async function readMeetSetup(): Promise<MeetSetup | null> {
    const read = await readGoogleCalendar();
    if (read.kind === "ready") {
        return { businessDefault: read.status.meetAccess };
    }
    // shortcut: someone off the diary isn't told the business's default;
    // Meet's own default stands in until the status read says it to them.
    return read.kind === "off-diary" ? { businessDefault: "RESTRICTED" } : null;
}
