import { Card } from "@/components/shared/card";
import { Marked } from "@/components/shared/marked";
import { placeholders } from "@/content/placeholders";

export function ContactCard() {
    return (
        <Card>
            <h2 className="m-0 font-display text-mk-card font-bold [text-wrap:balance]">
                Questions? Email us
            </h2>
            <p className="m-0 text-[15.5px] leading-normal text-mk-copy">
                <Marked text={placeholders.supportEmail} />
            </p>
        </Card>
    );
}
