import Mailgun from "mailgun.js";
import FormData from "form-data";

const mailgun = new Mailgun(FormData);
const client = mailgun.client({
  username: "api",
  key: process.env.MAILGUN_API_KEY,
});

/**
 * Sends one email and returns Mailgun's message id, which we store on the
 * campaign_recipients row so incoming webhook events (delivered/opened) can
 * be matched back to the right recipient.
 */
export async function sendEmail({ to, subject, html }) {
  const result = await client.messages.create(process.env.MAILGUN_DOMAIN, {
    from: process.env.MAILGUN_FROM,
    to: [to],
    subject,
    html: `
    <html>
      <body style="font-family: Arial, sans-serif;">
        ${html}
      </body>
    </html>
    `,
    // Mailgun tracks opens automatically for sandbox/verified domains once
    // tracking is turned on for the domain; o:tracking-opens makes it explicit
    // per-message so it doesn't depend on a dashboard toggle.
    "o:tracking": "yes",
    "o:tracking-opens": "yes",
  });
  // mailgun.js returns an id like "<20240101.abc123@sandbox...mailgun.org>"
  return result.id;
}
