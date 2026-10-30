"use client";

import { LeaveDialog, useLeaveGuard } from "@saroh/ui/use-leave-guard";
import { useState } from "react";

/**
 * The app's leave guard for an account sheet or dialog (DEC-199): typed
 * work isn't thrown away by a link (the menu, Back to Saroh), nor by
 * Escape, the × or Cancel. Those ask "Leave without saving?" first; a
 * press outside is already held by the frame.
 */
export function useSheetGuard(dirty: boolean, lost: string, close: () => void) {
    const leave = useLeaveGuard({ dirty, lost });
    const [asking, setAsking] = useState(false);
    return {
        onClose: () => (dirty ? setAsking(true) : close()),
        dialog: (
            <>
                {leave.dialog}
                <LeaveDialog
                    open={asking}
                    lost={lost}
                    onStay={() => setAsking(false)}
                    onLeave={() => {
                        setAsking(false);
                        close();
                    }}
                />
            </>
        ),
    };
}
