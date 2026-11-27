import { Button } from "@saroh/ui/button";
import { Phone } from "lucide-react";

import { phoneLabel } from "@/lib/organizations/business-phone";

/**
 * Who to ring about the money (finding 11): their number and email, and
 * Call, where the invoice sheet and the subscription sheet say the next
 * step is a call. Drawn only with a phone: the read carries one only for a
 * role that may see contact details (`contact:read`), and without one the
 * sentences don't offer a call. No WhatsApp chat link: the app has no house
 * one for a contact yet.
 */
export function CallThem({
    name,
    email,
    phone,
}: {
    name: string;
    email: string | null;
    phone: string;
}) {
    return (
        <div className="grid gap-1.5">
            <p data-ph-mask="" className="font-semibold">
                {name}
            </p>
            <p data-ph-mask="" className="text-[12.5px] text-muted-foreground">
                {[phoneLabel(phone), email].filter(Boolean).join(" · ")}
            </p>
            <Button
                asChild
                size="sm"
                variant="outline"
                className="w-fit"
                data-ph-mask=""
            >
                <a href={`tel:${phone.replace(/[^\d+]/g, "")}`}>
                    <Phone aria-hidden className="size-3.5" />
                    Call
                    <span className="sr-only"> {name}</span>
                </a>
            </Button>
        </div>
    );
}
