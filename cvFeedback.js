// cvFeedback.js — produces ONE high-level suggestion per check, matching
// the free pilot's "one suggestion" product rule. Rule-based by default
// so the backend works with zero configuration. If OPENAI_API_KEY is
// set, it asks a real model instead and falls back to the rules on any
// error so the endpoint never just breaks.
async function ruleBasedSuggestion(text) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const hasNumbers = /\d/.test(text);
  const weakVerbs = /\b(responsible for|worked on|helped with|involved in|duties included)\b/i.test(text);
  const actionVerbs = /\b(led|built|designed|launched|increased|reduced|created|managed|analysed|analyzed|delivered)\b/i.test(text);

  if (wordCount < 120) {
    return {
      tag: 'depth',
      suggestion: 'This reads quite short for a CV — recruiters usually expect 2–4 concrete examples per role. Add detail on what you actually did, not just your title.',
    };
  }
  if (weakVerbs && !actionVerbs) {
    return {
      tag: 'verbs',
      suggestion: 'Phrases like "responsible for" or "helped with" describe a role, not a result. Swap them for what you did and led — try "built", "increased" or "reduced".',
    };
  }
  if (!hasNumbers) {
    return {
      tag: 'evidence',
      suggestion: "There's no measurable outcome anywhere in this text. Even one number — time saved, people reached, size of a project — makes a claim easier to believe.",
    };
  }
  if (wordCount > 700) {
    return {
      tag: 'length',
      suggestion: "This is running long for a first read. Aim to trim it to what fits comfortably on two pages, cutting anything that doesn't support the role you want.",
    };
  }
  return {
    tag: 'structure',
    suggestion: "The content looks solid. Check that your strongest, most relevant point is in the first third — that's the part most likely to actually get read.",
  };
}

async function aiSuggestion(text) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const prompt = `You review CVs for university students. Read the CV text below and give exactly ONE high-level suggestion — the single thing most worth fixing first. Reply as JSON only: {"tag": "a two-word label", "suggestion": "1-2 sentences, plain and specific"}.\n\nCV:\n${text.slice(0, 6000)}`;

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
      response_format: { type: 'json_object' },
    }),
  });

  if (!resp.ok) throw new Error(`OpenAI request failed: ${resp.status}`);
  const data = await resp.json();
  const raw = data.choices?.[0]?.message?.content;
  const parsed = JSON.parse(raw);
  if (!parsed.suggestion) throw new Error('Malformed AI response');
  return { tag: parsed.tag || 'suggestion', suggestion: parsed.suggestion };
}

async function getCvFeedback(text) {
  try {
    const ai = await aiSuggestion(text);
    if (ai) return { ...ai, source: 'ai' };
  } catch (err) {
    console.error('AI CV feedback failed, falling back to rules:', err.message);
  }
  const rule = await ruleBasedSuggestion(text);
  return { ...rule, source: 'rules' };
}

module.exports = { getCvFeedback };
