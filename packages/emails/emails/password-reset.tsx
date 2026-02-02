import { Button, Head, Hr, Html, Preview, Section, Text } from "@react-email/components";

interface PasswordResetEmailProps {
    resetUrl: string;
    userEmail?: string;
}

export const PasswordResetEmail = ({ resetUrl, userEmail }: PasswordResetEmailProps) => {
    return (
        <Html>
            <Head />
            <Preview>Reset your Saroh password</Preview>
            <Section style={section}>
                <Text style={heading}>Reset your password</Text>
                <Text style={paragraph}>
                    You requested a password reset for your Saroh account
                    {userEmail ? ` (${userEmail})` : ""}.
                </Text>
                <Text style={paragraph}>
                    Click the button below to set a new password. This link will expire in 1 hour.
                </Text>
                <Button style={button} href={resetUrl}>
                    Reset password
                </Button>
                <Hr style={hr} />
                <Text style={footer}>
                    If you didn&apos;t request this, you can safely ignore this email.
                </Text>
            </Section>
        </Html>
    );
};

export default PasswordResetEmail;

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
