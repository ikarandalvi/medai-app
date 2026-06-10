// MedAI chat backend. Runs on Vercel as a serverless function at /api/chat.
// The API key lives ONLY here, read from an environment variable. It never
// reaches the browser. The browser calls this function, this function calls
// Anthropic.

const SYSTEM_PROMPT = require('../prompt.js');
const KNOWLEDGE = require('../knowledge.json');

// Verify the current model string in your Anthropic console if this errors.
const MODEL = 'claude-sonnet-4-6';

function tryJson(s) {
  try { return JSON.parse(s); } catch (e) { return null; }
}

// Turn the model's raw text into a safe reply object. The model is told to
// return a single JSON object. If stray text surrounds it, extract the JSON by
// taking the first "{" through the last "}". Only if that fails do we fall back
// to the prose with any JSON-looking block stripped out, so the user never sees
// a raw {"type":...} block.
function extractReply(raw) {
  const clean = (raw || '').replace(/```json/gi, '').replace(/```/g, '').trim();

  let parsed = tryJson(clean);
  if (!parsed) {
    const first = clean.indexOf('{');
    const last = clean.lastIndexOf('}');
    if (first !== -1 && last !== -1 && last > first) {
      parsed = tryJson(clean.slice(first, last + 1));
    }
  }

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return {
      type: typeof parsed.type === 'string' ? parsed.type : 'normal',
      text: (typeof parsed.text === 'string' && parsed.text.trim()) ? parsed.text : 'Sorry, please say that again.',
      source: typeof parsed.source === 'string' ? parsed.source : '',
      agent: typeof parsed.agent === 'string' ? parsed.agent : ''
    };
  }

  // Fallback: show only the prose, stripping any JSON-looking block (leading,
  // trailing, or a truncated/unterminated one) so no raw object leaks out.
  const stripped = clean
    .replace(/\{[\s\S]*\}/g, '')   // complete { ... } block(s)
    .replace(/\{[\s\S]*$/, '')     // unterminated trailing { ... fragment
    .replace(/^[\s\S]*?\}/, '')    // orphan leading ... } fragment
    .trim();
  return { type: 'normal', text: stripped || 'Sorry, please say that again.', source: '', agent: 'unparsed' };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ type: 'normal', text: 'The server is missing its API key. Set ANTHROPIC_API_KEY in Vercel.', source: '', agent: 'config error' });
    return;
  }

  // req.body may arrive parsed or as a string depending on setup.
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const messages = Array.isArray(body && body.messages) ? body.messages : [];
  const profile = (body && body.profile) || {};

  // Build the system prompt: rules + injected verified knowledge + user context.
  let system = SYSTEM_PROMPT
    + '\n\n== VERIFIED KNOWLEDGE (use only this for cited claims) ==\n'
    + JSON.stringify(KNOWLEDGE);
  if (profile.language) system += '\n\nReply in this language: ' + profile.language + '.';
  if (profile.name) system += '\n\nThe user\'s name is ' + profile.name + '. You may greet them by it.';

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 700,
        system: system,
        messages: messages
      })
    });

    const data = await r.json();
    if (!r.ok) {
      res.status(502).json({ type: 'normal', text: 'The model could not be reached. ' + (data.error && data.error.message ? data.error.message : ''), source: '', agent: 'api error' });
      return;
    }

    // Pull the text out of the content blocks.
    let raw = '';
    if (Array.isArray(data.content)) {
      raw = data.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    }

    // The model is told to return a single JSON object. Strip any fences and parse.
    let clean = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (e) {
      // Fallback: if it ever returns plain text, wrap it safely.
      parsed = { type: 'normal', text: raw || 'Sorry, please say that again.', source: '', agent: 'unparsed' };
    }
    if (!parsed.type) parsed.type = 'normal';
    if (typeof parsed.text !== 'string') parsed.text = 'Sorry, please say that again.';
    res.status(200).json(parsed);
  } catch (err) {
    res.status(500).json({ type: 'normal', text: 'Something went wrong on the server.', source: '', agent: 'server error' });
  }
};
