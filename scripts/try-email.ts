import { sendEmail } from "../src/lib/email/resend";

// Sends to Resend's own test inbox, so no real person is emailed.
async function main() {
  const r = await sendEmail({ to: "delivered@resend.dev", subject: "Verbalore email check", html: "<p>Plumbing check from Verbalore.</p>" });
  console.log(r.simulated ? "SIMULATED (no key)" : `SENT id=${r.id}`);
  console.log("from:", process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev");
}
main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
