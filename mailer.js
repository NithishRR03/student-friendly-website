const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

async function sendCode(email, code) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log(`[DEV] OTP code for ${email}: ${code}`);
    return;
  }

  await transporter.sendMail({
    from: `"Student Friendly" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Your Student Friendly Login Code',
    text: `Your Student Friendly login code is: ${code}. It expires in 10 minutes. If you did not request this, please ignore this email.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
        <h2 style="color: #111;">Student Friendly Login Code</h2>
        <p>Use the code below to log in to your account:</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #4F46E5; margin: 20px 0;">${code}</div>
        <p style="color: #666; font-size: 13px;">This code expires in 10 minutes. If you didn't request this email, you can safely ignore it.</p>
      </div>
    `
  });
}

module.exports = { sendCode };
