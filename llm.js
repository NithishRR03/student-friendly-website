// llm.js — one place to call Claude or OpenAI. Returns null when no key is configured.
async function llm(prompt, max = 800) {
  if (process.env.ANTHROPIC_API_KEY) {
    const base = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
    const r = await fetch(base + '/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5', max_tokens: max, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!r.ok) throw new Error('llm_' + r.status);
    return (await r.json()).content[0].text;
  }
  if (process.env.OPENAI_API_KEY) {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', max_tokens: max, messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' } }),
    });
    if (!r.ok) throw new Error('llm_' + r.status);
    return (await r.json()).choices[0].message.content;
  }
  return null;
}
const parseJson = (t) => JSON.parse(t.match(/\{[\s\S]*\}/)[0]);
module.exports = { llm, parseJson };
