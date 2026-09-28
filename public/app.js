const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MSG = {
  invalid_email: 'Please enter a valid email.', missing_fields: 'Please fill in every field.', invalid_phone: 'Please enter a valid phone number.',
  consent_required: 'Please tick the consent box.', email_exists: 'That email is already registered — log in instead.',
  bad_code: 'That code is wrong or has expired.', too_many_attempts: 'Too many attempts — request a new code.', not_logged_in: 'Please log in first.', add_details_first: 'Add some skills, education or experience first, then try again.',
};
const CHECKLIST = [
  ['c1', 'Photo, headline and banner filled in'], ['c2', "Headline says what you're looking for, not just your degree"],
  ['c3', 'About section in first person, 3–4 short paragraphs'], ['c4', 'Each experience has one measurable outcome'],
  ['c5', 'At least five relevant skills added and pinned'], ['c6', 'Custom LinkedIn URL set'],
];
let user = null, pendingEmail = '';

const tok = () => { try { return localStorage.getItem('sf_session'); } catch { return null; } };
const setTok = (t) => { try { t ? localStorage.setItem('sf_session', t) : localStorage.removeItem('sf_session'); } catch {} };
const say = (el, t, ok) => { el.textContent = t; el.className = 'msg ' + (ok ? 'ok' : 'err'); };
const errText = (e) => e.status === 429 ? 'Too many requests — please wait a minute and try again.' : MSG[e.message] || 'Something went wrong — please try again.';

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (tok()) headers.Authorization = 'Bearer ' + tok();
  const r = await fetch(path, { ...opts, headers });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(body.error || 'error'), { status: r.status });
  return body;
}

function drawNav() {
  $('#navAuth').innerHTML = user
    ? `<a href="#/account">${esc(user.name.split(' ')[0])}</a>`
    : '<a href="#/login">Log in</a><a class="btn sm" href="#/register">Sign up</a>';
}
function route() {
  let v = location.hash.replace(/^#\//, '') || 'home';
  if (!['home', 'register', 'login', 'verify', 'account', 'tools', 'builder', 'privacy'].includes(v)) v = 'home';
  if ((v === 'account' || v === 'tools' || v === 'builder') && !user) { location.hash = '#/login'; return; }
  $$('.view').forEach((e) => { e.hidden = e.id !== 'v-' + v; });
  if (v === 'account') fillAccount();
  if (v === 'tools') loadChecklist();
  if (v === 'builder') loadBuilder();
  scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

// ── Search + AI suggestions ─────────────────────────────────────────
function renderResults(d) {
  const s = d.suggestions;
  let h = '';
  if (s && s.picks.length) {
    h += `<div class="panel"><div class="tag">${s.ai ? 'AI suggestions' : 'Suggested for you'}</div>` +
      s.picks.map((p) => `<div class="pick"><b>${esc(p.title)}</b> · ${esc(p.company)}<p>${esc(p.reason)}</p></div>`).join('') +
      (s.advice ? `<p class="muted">${esc(s.advice)}</p>` : '') + '</div>';
  }
  if (!user) h += '<p class="muted">✦ <a href="#/register">Sign up free</a> to get suggestions matched to your course and job field.</p>';
  h += d.jobs.length ? d.jobs.map((j) => `<article class="job"><h3>${esc(j.title)}</h3>
      <div class="meta">${esc(j.company)}${j.location ? ' · ' + esc(j.location) : ''}${j.field ? ' · ' + esc(j.field) : ''}</div>
      <p>${esc(j.description)}</p>${/^https?:\/\//.test(j.url || '') ? `<a href="${esc(j.url)}" target="_blank" rel="noopener noreferrer">View &amp; apply →</a>` : ''}</article>`).join('')
    : '<p class="muted">No vacancies matched. Try a broader keyword.</p>';
  if (d.source === 'sample') h += '<p class="muted small">Demo mode: these are fictional sample listings. Connect a live jobs source (see README) to show real vacancies.</p>';
  $('#results').innerHTML = h;
}
$('#searchForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#results').innerHTML = '<p class="muted">Searching…</p>';
  try { renderResults(await api('/api/jobs/search?' + new URLSearchParams({ q: $('#q').value, where: $('#where').value }))); }
  catch { $('#results').innerHTML = '<p class="msg err">Search failed — please try again in a minute.</p>'; }
});

// ── Register / login (emailed code) ─────────────────────────────────
function goVerify(email, devCode) {
  pendingEmail = email; $('#vEmail').textContent = email; $('#verifyMsg').textContent = '';
  $('#code').value = devCode || '';
  location.hash = '#/verify';
}
$('#regForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target)); f.consent = $('#consent').checked;
  try { const d = await api('/api/auth/register', { method: 'POST', body: JSON.stringify(f) }); goVerify(f.email.trim().toLowerCase(), d.devCode); }
  catch (err) { say($('#regMsg'), errText(err)); }
});
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = new FormData(e.target).get('email').trim().toLowerCase();
  try { const d = await api('/api/auth/request-code', { method: 'POST', body: JSON.stringify({ email }) }); goVerify(email, d.devCode); }
  catch (err) { say($('#loginMsg'), errText(err)); }
});
$('#verifyForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const d = await api('/api/auth/verify', { method: 'POST', body: JSON.stringify({ email: pendingEmail, code: $('#code').value }) });
    setTok(d.token); user = d.user; drawNav(); location.hash = '#/';
  } catch (err) { say($('#verifyMsg'), errText(err)); }
});

// ── Account ─────────────────────────────────────────────────────────
function fillAccount() {
  $('#acctEmail').textContent = user.email;
  for (const k of ['name', 'phone', 'course', 'job_field']) $('#acctForm').elements[k].value = user[k];
}
$('#acctForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/profile/me', { method: 'PUT', body: JSON.stringify(Object.fromEntries(new FormData(e.target))) });
    user = { ...user, ...Object.fromEntries(new FormData(e.target)) }; drawNav(); say($('#acctMsg'), 'Saved.', true);
  } catch (err) { say($('#acctMsg'), errText(err)); }
});
$('#logoutBtn').addEventListener('click', async () => {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch {}
  setTok(null); user = null; drawNav(); location.hash = '#/';
});
$('#exportBtn').addEventListener('click', async () => {
  const d = await api('/api/gdpr/export');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' })); a.download = 'my-data.json'; a.click();
});
$('#deleteBtn').addEventListener('click', async () => {
  if (!confirm('Permanently delete your account and all your data? This cannot be undone.')) return;
  await api('/api/profile/me', { method: 'DELETE' }); setTok(null); user = null; drawNav(); location.hash = '#/';
});

// ── CV check + LinkedIn checklist ───────────────────────────────────
$('#cvForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const out = $('#cvOut'); out.hidden = false; out.innerHTML = '<p class="muted">Checking…</p>';
  try {
    const r = await api('/api/cv/check', { method: 'POST', body: JSON.stringify({ text: $('#cv').value }) });
    out.innerHTML = `<div class="tag">Top suggestion: ${esc(r.tag)}</div><p>${esc(r.suggestion)}</p>`;
  } catch (err) { out.innerHTML = `<p class="msg err">${err.message === 'cv_text_too_short' ? 'Paste a bit more of your CV first.' : 'Could not check right now.'}</p>`; }
});
async function loadChecklist() {
  let state = {};
  try { state = (await api('/api/checklist')).state; } catch {}
  $('#checklist').innerHTML = CHECKLIST.map(([id, t]) => `<label><input type="checkbox" id="${id}" ${state[id] ? 'checked' : ''}><span>${esc(t)}</span></label>`).join('');
  progress();
}
function progress() { $('#progress').textContent = $$('#checklist input:checked').length + ' of ' + CHECKLIST.length + ' done'; }
$('#checklist').addEventListener('change', async (e) => {
  progress();
  try { await api('/api/checklist/' + e.target.id, { method: 'PUT', body: JSON.stringify({ checked: e.target.checked }) }); } catch {}
});

// ── Resume + LinkedIn builder ───────────────────────────────────────
const SEC = {
  edu: { title: 'Education', f: [['school', 'School / university'], ['degree', 'Degree and course'], ['dates', 'Dates (e.g. 2023–2026)'], ['details', 'Modules, grade, dissertation, achievements', 1]] },
  exp: { title: 'Experience (jobs, internships, volunteering)', f: [['role', 'Job title'], ['company', 'Company'], ['dates', 'Dates'], ['details', 'What did you do? Rough notes are fine — include numbers if you have them.', 1]] },
  proj: { title: 'Projects', f: [['name', 'Project name'], ['link', 'Link (optional)'], ['details', 'What you built or did, and the result', 1]] },
};
let bData = {}, copies = [];
const entryHtml = (sec, o = {}) => `<div class="entry">${SEC[sec].f.map(([k, l, t]) => `<label>${l}${t
  ? `<textarea data-k="${k}" rows="3" maxlength="1500">${esc(o[k])}</textarea>` : `<input data-k="${k}" maxlength="150" value="${esc(o[k])}">`}</label>`).join('')}<button type="button" class="btn ghost sm" data-rm>Remove</button></div>`;
function buildSecs() {
  $('#secs').innerHTML = Object.keys(SEC).map((s) => `<fieldset><legend>${SEC[s].title}</legend><div data-list="${s}">${((bData[s] && bData[s].length) ? bData[s] : [{}]).map((o) => entryHtml(s, o)).join('')}</div><button type="button" class="btn ghost sm" data-add="${s}">+ Add another</button></fieldset>`).join('');
}
async function loadBuilder() {
  try { bData = (await api('/api/resume/data')).data; } catch { bData = {}; }
  const f = $('#builderForm').elements;
  for (const k of ['target_role', 'location', 'linkedin', 'skills', 'extras']) f[k].value = bData[k] || '';
  buildSecs();
}
function collect() {
  const f = $('#builderForm').elements, d = {};
  for (const k of ['target_role', 'location', 'linkedin', 'skills', 'extras']) d[k] = f[k].value;
  for (const s of Object.keys(SEC)) d[s] = $$(`[data-list="${s}"] .entry`).map((e) => Object.fromEntries([...e.querySelectorAll('[data-k]')].map((x) => [x.dataset.k, x.value])));
  return d;
}
async function saveBuilder() { bData = (await api('/api/resume/data', { method: 'PUT', body: JSON.stringify(collect()) })).data; }
$('#secs').addEventListener('click', (e) => {
  const add = e.target.closest('[data-add]'), rm = e.target.closest('[data-rm]');
  if (add) $(`[data-list="${add.dataset.add}"]`).insertAdjacentHTML('beforeend', entryHtml(add.dataset.add));
  if (rm) rm.closest('.entry').remove();
});
$('#builderForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try { await saveBuilder(); say($('#bMsg'), 'Saved.', true); } catch (err) { say($('#bMsg'), errText(err)); }
});
$('#genResume').addEventListener('click', async () => {
  say($('#bMsg'), 'Writing your resume…', true);
  try {
    await saveBuilder();
    const r = await api('/api/resume/generate', { method: 'POST' });
    $('#resumeText').value = r.text; $('#resumeOut').hidden = false; $('#resumeTag').textContent = r.ai ? 'Your ATS-friendly resume (AI-written)' : 'Your ATS-friendly resume (built from your details)';
    say($('#bMsg'), 'Done — scroll down.', true); $('#resumeOut').scrollIntoView({ behavior: 'smooth' });
  } catch (err) { say($('#bMsg'), errText(err)); }
});
const flash = (b, t) => { const o = b.textContent; b.textContent = t; setTimeout(() => { b.textContent = o; }, 1500); };
$('#rCopy').addEventListener('click', (e) => navigator.clipboard.writeText($('#resumeText').value).then(() => flash(e.target, 'Copied')));
$('#rTxt').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([$('#resumeText').value], { type: 'text/plain' })); a.download = ((user && user.name) || 'my').replace(/\s+/g, '-') + '-resume.txt'; a.click();
});
$('#rPrint').addEventListener('click', () => { $('#printArea').textContent = $('#resumeText').value; print(); });

function renderKit(k) {
  copies = [];
  const blk = (t, text) => { copies.push(text); return `<div class="panel"><div class="tag">${esc(t)}</div><pre class="out">${esc(text)}</pre><button class="btn ghost sm" data-copy="${copies.length - 1}" type="button">Copy</button></div>`; };
  let h = `<h2 class="gap">Your LinkedIn kit</h2><p class="muted small">${k.ai ? 'Written by AI from your details' : 'Built from your details'} — edit anything that isn't quite you before pasting it into LinkedIn.</p>`;
  k.headlines.forEach((x, i) => { h += blk('Headline option ' + (i + 1), x); });
  h += blk('About (your bio)', k.about);
  if (k.pinned.length) h += blk('Pin these 3 skills', k.pinned.join('\n'));
  if (k.skills.length) h += blk('Skills to add', k.skills.join('\n'));
  if (k.suggested.length) h += blk('Also add these — only if you genuinely have them', k.suggested.join('\n'));
  for (const [key, label] of [['experience', 'Experience'], ['education', 'Education'], ['projects', 'Project']]) k[key].forEach((x) => { if (x.description) h += blk(`${label}: ${x.title}`, x.description); });
  if (k.tips.length) h += `<div class="panel"><div class="tag">Profile tips</div><ul>${k.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>`;
  $('#kitOut').innerHTML = h;
}
$('#genKit').addEventListener('click', async () => {
  say($('#bMsg'), 'Writing your LinkedIn kit…', true);
  try { await saveBuilder(); renderKit(await api('/api/resume/linkedin', { method: 'POST' })); say($('#bMsg'), 'Done — scroll down.', true); $('#kitOut').scrollIntoView({ behavior: 'smooth' }); }
  catch (err) { say($('#bMsg'), errText(err)); }
});
$('#kitOut').addEventListener('click', (e) => {
  const b = e.target.closest('[data-copy]');
  if (b) navigator.clipboard.writeText(copies[b.dataset.copy]).then(() => flash(b, 'Copied'));
});

(async function init() {
  if (tok()) { try { user = await api('/api/profile/me'); } catch { setTok(null); } }
  drawNav(); route();
})();
