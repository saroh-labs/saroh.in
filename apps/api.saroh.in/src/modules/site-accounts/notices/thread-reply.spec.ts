// A team reply in Messages, emailed (DEC-174 U14, #1145): its words, the
// replies quoted, the way back to Messages, and that it is email only,
// behind the TEAM_REPLY switch.
import { noticeDefinition, renderNotice, withLink } from ".";
import { NOTICE_SENDS } from "../../communications/notice-settings";
import { pathOf } from "../notice-link";
import type { TeamReplyNotice } from "./thread-reply";
import { teamReplyNotice, teamReplyNoticeKey } from "./thread-reply";

jest.mock("../account-area", () => ({ accountAreaOn: jest.fn(() => true) }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const area = require("../account-area") as { accountAreaOn: jest.Mock };

const notice = (
    over: Partial<TeamReplyNotice["reply"]> = {},
): TeamReplyNotice => ({
    kind: "THREAD_REPLY",
    reply: {
        business: "Rye & Co.",
        firstName: "Asha",
        replies: ["Yes, 40 are on the shelf."],
        link: null,
        ...over,
    },
});

describe("a team reply's email", () => {
    it("is registered, behind TEAM_REPLY, which is marked as sent", () => {
        expect(noticeDefinition("THREAD_REPLY")).toBe(teamReplyNotice);
        expect(teamReplyNotice.setting).toBe("TEAM_REPLY");
        expect(NOTICE_SENDS.TEAM_REPLY).toBe(true);
    });

    it("is email only: the reply is already in the thread", () => {
        expect(teamReplyNotice.emailOnly).toBe(true);
    });

    it("says the business replied, by name, and quotes the reply", () => {
        const { subject, body } = renderNotice(notice());
        expect(subject).toBe("Rye & Co. replied to your message");
        expect(body).toContain("<p>Hi Asha,</p>");
        expect(body).toContain("Rye &amp; Co. replied to your message.");
        expect(body).toContain("<p>Their reply:</p>");
        expect(body).toContain(
            "<blockquote>Yes, 40 are on the shelf.</blockquote>",
        );
    });

    it("three replies are one quote, oldest first, a blank line apart", () => {
        const { body } = renderNotice(
            notice({ replies: ["One.", "Two.", "Three."] }),
        );
        expect(body).toContain("<p>Their replies:</p>");
        expect(body).toContain(
            "<blockquote>One.<br><br>Two.<br><br>Three.</blockquote>",
        );
    });

    it("escapes what the team typed and keeps its line breaks", () => {
        const { body } = renderNotice(
            notice({ replies: ["<script>x</script>\nSecond line"] }),
        );
        expect(body).not.toContain("<script>");
        expect(body).toContain("&lt;script&gt;x&lt;/script&gt;<br>Second line");
    });

    it("links back to their Messages, and only to a web address", () => {
        const linked = renderNotice(
            withLink(notice(), "https://rye.saroh.app/account/messages"),
        );
        expect(linked.body).toContain("Read it and reply in your Messages:");
        expect(linked.body).toContain(
            'href="https://rye.saroh.app/account/messages"',
        );
        const bad = renderNotice(withLink(notice(), "javascript:alert(1)"));
        expect(bad.body).not.toContain("javascript:");
        expect(renderNotice(notice()).body).not.toContain("Messages:");
    });

    it("the way back is Messages while the account area is on, and none while it is off", () => {
        area.accountAreaOn.mockReturnValue(true);
        expect(pathOf({ kind: "THREAD_REPLY" })).toBe("/account/messages");
        area.accountAreaOn.mockReturnValue(false);
        expect(pathOf({ kind: "THREAD_REPLY" })).toBeNull();
    });

    it("with no name it says Hello", () => {
        const { body } = renderNotice(notice({ firstName: null }));
        expect(body).toContain("<p>Hello,</p>");
    });

    it("is keyed once per reply", () => {
        expect(teamReplyNoticeKey("m_1")).toBe("thread-reply:m_1");
    });

    it("a load for another kind's payload reads nothing", async () => {
        await expect(
            teamReplyNotice.load(
                {} as never,
                "org_1",
                { kind: "ORDER_READY", eventKey: "x" },
                new Date(),
            ),
        ).resolves.toBeNull();
        await expect(
            teamReplyNotice.load(
                {} as never,
                "org_1",
                { kind: "THREAD_REPLY", eventKey: "x" },
                new Date(),
            ),
        ).resolves.toBeNull();
    });
});
