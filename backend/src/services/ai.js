const { env } = require('../config/env');

// Lazily constructed: `new OpenAI()` throws when the key is missing, which used
// to crash the API on boot in any environment without OPENAI_API_KEY.
let client = null;

function getOpenAI() {
  if (!env.aiEnabled) return null;
  if (!client) {
    const OpenAI = require('openai');
    client = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 45_000, maxRetries: 1 });
  }
  return client;
}

// Thrown when AI is configured but the call failed. Routes turn this into a
// retryable 503 instead of silently storing a placeholder score.
class AiUnavailableError extends Error {
  constructor(cause) {
    super('AI analysis is temporarily unavailable');
    this.cause = cause;
  }
}

async function structuredCompletion({ model, system, user, schemaName, schema, temperature = 0.2, messages }) {
  const openai = getOpenAI();
  if (!openai) throw new AiUnavailableError(new Error('OPENAI_API_KEY not set'));
  try {
    const response = await openai.chat.completions.create({
      model: model || env.OPENAI_MODEL,
      temperature,
      messages: messages || [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: schemaName, strict: true, schema },
      },
    });
    return JSON.parse(response.choices[0].message.content);
  } catch (err) {
    console.error(`[ai] ${schemaName} failed:`, err.message);
    throw new AiUnavailableError(err);
  }
}

async function textCompletion({ model, messages, temperature = 0.7, maxTokens = 300 }) {
  const openai = getOpenAI();
  if (!openai) throw new AiUnavailableError(new Error('OPENAI_API_KEY not set'));
  try {
    const response = await openai.chat.completions.create({
      model: model || env.OPENAI_FAST_MODEL,
      temperature,
      max_tokens: maxTokens,
      messages,
    });
    return (response.choices[0].message.content || '').trim();
  } catch (err) {
    console.error('[ai] text completion failed:', err.message);
    throw new AiUnavailableError(err);
  }
}

module.exports = { getOpenAI, structuredCompletion, textCompletion, AiUnavailableError };
