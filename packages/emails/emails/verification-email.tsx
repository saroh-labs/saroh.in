import { Button, Head, Hr, Html, Preview, Section, Text } from "@react-email/components";

interface VerificationEmailProps {
    verifyUrl: string;
    userEmail?: string;
}

export const VerificationEmail = ({ verifyUrl, userEmail }: VerificationEmailProps) => {
    return (
        <Html>
            <Head />
            <Preview>Verify your Saroh email address</Preview>
            <Section style={section}>
                <Text style={heading}>Verify your email</Text>
                <Text style={paragraph}>
                    Please verify your email address for your Saroh account
                    {userEmail ? ` (${userEmail})` : ""}.
                </Text>
                <Button style={button} href={verifyUrl}>
                    Verify email
                </Button>
                <Hr style={hr} />
                <Text style={footer}>
                    If you didn&apos;t create an account, you can safely ignore this email.
                </Text>
            </Section>
        </Html>
    );
};

export default VerificationEmail;

const section = {
    padding: "24px",
    maxWidth: "480px",
};

const heading = {
    fontSize: "20px",
    fontWeight: "600",
    margin: "0 0 16px",
};

const paragraph = {
    fontSize: "14px",
    lineHeight: "24px",
    margin: "0 0 16px",
    color: "#374151",
};

const button = {
    background: "#000",
    color: "#fff",
    padding: "12px 20px",
    borderRadius: "6px",
    fontSize: "14px",
    fontWeight: "500",
};

const hr = {
    borderColor: "#e5e7eb",
    margin: "24px 0",
};

const footer = {
    fontSize: "12px",
    color: "#6b7280",
};
