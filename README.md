# Student Friendly — full website (frontend + backend)

One Node app serves both the website (`public/`) and the API (`routes/`). SQLite database.

## Run locally
```bash
npm install
cp .env.example .env      # set DEV_SHOW_CODE=true for local testing
npm start                 # open http://localhost:3000
```
With `DEV_SHOW_CODE=true` the login code is pre-filled on screen; without it, the code is emailed (or printed in the server log if no email key is set).

## What visitors can do
- Search vacancies (no account needed) and see AI suggestions.
- Sign up with name, phone, email, course, job field (+ consent tick) — saved to the database.
- Log in with their email: a 6-digit code is emailed, no password.
- Get suggestions matched to their course and job field, edit profile, download or delete their data.
- CV check + LinkedIn checklist (logged in).
- **Resume & LinkedIn builder** (logged in): they enter education, experience, projects and skills, then get an ATS-friendly resume (plain single-column text; copy, download .txt, or print/save as PDF) and a LinkedIn kit (3 headlines, About/bio, skills, pinned skills, suggested skills, experience/education/project descriptions, tips).
- **Privacy policy** page (`#/privacy`).

## Turn on the real services (all optional, set in `.env` / host dashboard)
| Feature | Variables | Without it |
|---|---|---|
| Login emails | `RESEND_API_KEY`, `MAIL_FROM` (verified domain) | Code printed in server log only |
| Live vacancies | `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` | Fictional sample listings |
| AI suggestions | `ANTHROPIC_API_KEY` **or** `OPENAI_API_KEY` | Keyword matcher |

Never set `DEV_SHOW_CODE=true` in production: it would let anyone log in as anyone.

## Deploy on Render
1. Push this folder to GitHub → Render **New → Web Service**. Build `npm install`, start `npm start`.
2. Add a persistent disk at `/data` and set `DB_PATH=/data/app.db` (otherwise the database resets on each deploy).
3. Add the environment variables above. Set `ALLOWED_ORIGINS` to your site URL.

## Before you publish
- Open `public/index.html`, find the privacy policy section and replace `[YOUR FULL NAME]` and `[YOUR CONTACT EMAIL]`. Check whether you need to pay the ICO data protection fee (ico.org.uk). This policy is a solid starting draft, not legal advice.
- The AI prompts never include the student's name, phone or email, and tell the model not to invent facts. Without an AI key the resume and LinkedIn kit are assembled from the student's own words (no rewriting).

## Data you hold (UK GDPR)
You store names, phone numbers and emails, so: publish a privacy policy before sharing widely, only keep what you need, and honour the export/delete buttons (`/api/gdpr/export`, `DELETE /api/profile/me`).
