import { destructiveAlertClasses } from "../../alert";
import { cn } from "../../lib/utils";
import { accentTint } from "../styles";

/**
 * What the booking page has to say under its steps on a phone, where there
 * is no summary beside them. An error — the time went, the booking was
 * refused — is the red alert. News that isn't a failure — a class credit was
 * found and picked (A10), a place is held for you, you've left the line —
 * is a quiet note in the site's accent, announced politely: a member who
 * signed in and was offered their credit has done nothing wrong.
 */
export type FlowMessageTone = "error" | "notice";

export interface FlowMessage {
    text: string;
    tone: FlowMessageTone;
}

export function FlowMessageLine({ message }: { message: FlowMessage }) {
    if (message.tone === "error") {
        return (
            <p role="alert" className={destructiveAlertClasses}>
                {message.text}
            </p>
        );
    }
    return (
        <p
            role="status"
            className={cn(
                "border-site-accent text-site-fg rounded-lg border px-3 py-2 text-sm",
                accentTint,
            )}
        >
            {message.text}
        </p>
    );
}
