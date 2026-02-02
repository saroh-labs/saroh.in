import { render } from "@react-email/components";

import { FirstEmail } from "@saroh/emails/emails/first-email";

export default function Home() {
    const emailHTML = render(FirstEmail());
    return <div dangerouslySetInnerHTML={{ __html: emailHTML }} />;
}
