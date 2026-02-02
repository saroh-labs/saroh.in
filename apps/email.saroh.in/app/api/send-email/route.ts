import { render } from "@react-email/components";

import { FirstEmail } from "@saroh/emails/emails/first-email";
import { NextRequest } from "next/server";

import nodemailer from "nodemailer";

const USER_ACCOUNT = process.env.USER_ACCOUNT;
const USER_PASSWORD = process.env.USER_PASSWORD;
const SENDER_EMAIL_ID = process.env.SENDER_EMAIL_ID;

const transporter = nodemailer.createTransport({
    service: "Gmail",
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
        user: USER_ACCOUNT,

        pass: USER_PASSWORD,
    },
});
const emailHTML = render(FirstEmail());
const options = {
    from: `Mohit <${SENDER_EMAIL_ID}>`,

    subject: "Testing mail from Saroh",
    html: emailHTML,
};

export async function GET(req: NextRequest) {
    const searchParams = await req.nextUrl.searchParams;
    const receiverName = searchParams.get("receiverName");
    const receiverEmail = searchParams.get("receiverEmail");

    const result = await transporter.sendMail({
        ...options,
        to: `${receiverName} <${receiverEmail}>`,
    });
    return Response.json({ result, status: "success" });
}
// await transporter.sendMail(options);
