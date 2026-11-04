import { Card } from "@/components/shared/card";
import { Marked } from "@/components/shared/marked";
import { placeholders } from "@/content/placeholders";

export function ContactCard() {
    return (
        <Card>
            <h2 className="m-0 font-display text-[21px] font-bold tracking-[-0.03em]">
                Questions? Email us
            </h2>
            <p className="m-0 text-[15.5px] leading-normal text-body">
                <Marked text={placeholders.supportEmail} />
            </p>
        </Card>
    );
}
