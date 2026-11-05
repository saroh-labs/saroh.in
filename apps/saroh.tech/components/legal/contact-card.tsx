import { Card } from "@/components/shared/card";
import { SUPPORT_EMAIL } from "@/content/contact";
import { textLinkClasses } from "@saroh/marketing/text-link";

export function ContactCard() {
    return (
        <Card>
            <h2 className="m-0 font-display text-mk-card font-bold [text-wrap:balance]">
                Questions? Email us
            </h2>
            <p className="m-0 text-[15.5px] leading-normal text-mk-copy">
                <a
                    href={`mailto:${SUPPORT_EMAIL}`}
                    className={textLinkClasses()}
                >
                    {SUPPORT_EMAIL}
                </a>
            </p>
        </Card>
    );
}
