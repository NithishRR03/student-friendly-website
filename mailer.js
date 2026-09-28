// mailer.js — sends the login code via Resend (https://resend.com). With no RESEND_API_KEY
// it just logs the code to the server console, which is fine for local development only.
async function sendCode(email, code) {
  const key = process.env.RESEND_API_KEY;
  if (!key) { console.log(`[DEV] login code for ${email}: ${code}`); return; }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.MAIL_FROM, to: email, subject: 'Your Student Friendly login code', text: `Your login code is ${code}. It expires in 10 minutes. If you didn't ask for it, ignore this email.` }),
  });
  if (!r.ok) throw new Error('mail_failed_' + r.status);
}
module.exports = { sendCode };
