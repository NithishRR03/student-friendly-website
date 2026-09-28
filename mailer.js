// Sends login codes over HTTPS, which works on Render's free plan (Gmail SMTP does not).
async function sendCode(email, code) {
  const text = `Your Student Friendly login code is ${code}. It expires in 10 minutes. If you didn't ask for it, ignore this email.`;
  if (process.env.BREVO_API_KEY) {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: 'Student Friendly', email: process.env.MAIL_FROM_EMAIL },
        to: [{ email }],
        subject: 'Your Student Friendly login code',
        textContent: text,
      }),
    });
    if (!r.ok) throw new Error('brevo_' + r.status + ' ' + (await r.text()).slice(0, 200));
    return;
  }
  console.log(`[DEV] login code for ${email}: ${code}`);
}
module.exports = { sendCode };
