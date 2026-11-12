// Offline text heuristics. Used only when OPENAI_API_KEY is not configured
// (local dev, CI, or a deploy that hasn't added the key yet), so the app keeps
// working end to end. Results are always labelled source: 'estimate' and the UI
// says so — these are rough signals, not a language assessment.

const STOPWORDS = new Set(('a an the and or but if of to in on at by for with from is are was were be been being ' +
  'it its this that these those he she they we you i me my our your their his her them us as so do does did ' +
  'have has had not no yes there here what which who whom will would can could should may might must').split(' '));

const FILLERS = ['um', 'uh', 'erm', 'er', 'ah', 'hmm', 'like', 'you know', 'i mean', 'basically', 'actually', 'sort of', 'kind of'];

function words(text) {
  return (text.toLowerCase().match(/[a-z']+/g) || []);
}

function sentences(text) {
  return text.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
}

function contentWords(text) {
  return words(text).filter(w => w.length > 2 && !STOPWORDS.has(w));
}

// Common learner errors that are cheap to detect reliably.
const ERROR_PATTERNS = [
  { re: /\b(is|are|am|was|were) (\w+?)(?<!ing)\b (?=\w)/gi, test: (m) => /^(go|eat|order|pay|walk|run|talk|buy|sit|stand|make|take|drink|play|work|cook|read|write|wait|look|watch|open|close|carry|hold|use)$/i.test(m[2]),
    message: (m) => `"${m[1]} ${m[2]}" — use the -ing form for actions in progress ("${m[1]} ${m[2]}ing").` },
  { re: /\ba ([aeiou]\w*)/gi, test: (m) => !/^(uni|use|one|euro|u[bcfhjklmnpqrstvwxyz])/i.test(m[1]),
    message: (m) => `"a ${m[1]}" — use "an" before a vowel sound ("an ${m[1]}").` },
  { re: /\b(he|she|it) (have|do|go|don't)\b/gi, test: () => true,
    message: (m) => `"${m[1]} ${m[2]}" — third person singular needs "${({ have: 'has', do: 'does', go: 'goes', "don't": "doesn't" })[m[2].toLowerCase()]}".` },
  { re: /\b(i) /g, test: () => true, message: () => 'Always capitalise "I".' },
];

function detectIssues(text) {
  const issues = [];
  for (const p of ERROR_PATTERNS) {
    for (const m of text.matchAll(p.re)) {
      if (p.test(m)) issues.push(p.message(m));
      if (issues.length >= 4) return issues;
    }
  }
  return [...new Set(issues)];
}

function tidySentence(text) {
  let t = text.trim().replace(/\s+/g, ' ').replace(/\bi\b/g, 'I');
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (!/[.!?]$/.test(t)) t += '.';
  return t;
}

const clamp = (n, lo = 1, hi = 10) => Math.max(lo, Math.min(hi, Math.round(n)));

function estimateSceneFeedback({ student_response, reference_description, vocabularies = [] }) {
  const text = student_response.trim();
  const w = words(text);
  const unique = new Set(w);
  const issues = detectIssues(text);

  const ref = new Set(contentWords(reference_description || ''));
  const mine = new Set(contentWords(text));
  const overlap = ref.size ? [...ref].filter(x => mine.has(x)).length / ref.size : 0.5;
  const vocabHits = vocabularies.filter(v => v.word && unique.has(String(v.word).toLowerCase())).length;
  const ttr = w.length ? unique.size / w.length : 0;

  const grammar = clamp(8.5 - issues.length * 1.5 - (/[.!?]$/.test(text) ? 0 : 0.5) - (/^[A-Z]/.test(text) ? 0 : 0.5));
  const vocabulary = clamp(4 + ttr * 4 + Math.min(2, vocabHits) + (w.length > 15 ? 1 : 0));
  const clarity = clamp(3 + overlap * 6 + (w.length >= 8 ? 1 : 0));
  const overall = clamp(grammar * 0.4 + vocabulary * 0.3 + clarity * 0.3);

  const suggestions = [];
  if (overlap < 0.5) suggestions.push('Mention more of the key details you see: who is there, what they are doing, and where.');
  if (w.length < 15) suggestions.push('Try writing two sentences: one for the main action and one for a detail.');
  if (vocabularies.length && !vocabHits) suggestions.push(`Try using a key word from this scene, such as "${vocabularies[0].word}".`);
  if (!suggestions.length) suggestions.push('Add a descriptive adjective or adverb to make the scene more vivid.');

  return {
    grammar_score: grammar,
    vocabulary_score: vocabulary,
    clarity_score: clarity,
    overall_score: overall,
    issues,
    suggestions: suggestions.slice(0, 3),
    improved_sentence: tidySentence(text),
    ideal_sentence: reference_description || tidySentence(text),
    source: 'estimate',
  };
}

function countFillers(text) {
  const lower = ` ${text.toLowerCase().replace(/[^a-z' ]/g, ' ')} `;
  let n = 0;
  for (const f of FILLERS) {
    const re = new RegExp(` ${f} `, 'g');
    n += (lower.match(re) || []).length;
  }
  return n;
}


// ── Spoken-English signals (debates) ────────────────────────────────────────
// Browser speech recognition tidies up some hesitations before we see them, so
// these are lower bounds, labelled as such in the UI.

// Doubles that are correct English ("had had", "that that") are not stumbles.
const OK_DOUBLES = new Set(['had', 'that', 'is', 'very', 'so', 'bye', 'no', 'ha', 'really', 'many', 'more', 'far', 'long', 'again']);
const FILLER_SINGLE = new Set(FILLERS.filter(f => !f.includes(' ')));

function disfluency(text) {
  const w = words(text);
  const examples = [];
  let repetitions = 0;
  let restarts = 0;
  const snippet = (i, n) => w.slice(Math.max(0, i - 1), i + n + 1).join(' ');

  for (let i = 1; i < w.length; i++) {
    // "I I think", "the the"
    if (w[i] === w[i - 1] && !OK_DOUBLES.has(w[i]) && !FILLER_SINGLE.has(w[i])) {
      let end = i;
      while (end + 1 < w.length && w[end + 1] === w[i]) end++; // "and and and" = one stumble
      repetitions++;
      if (examples.length < 6) examples.push({ kind: 'repetition', text: snippet(i - 1, end - i + 2) });
      i = end;
      continue;
    }
    // "I think I think", "we should we should" — a restarted phrase
    if (i >= 3 && w[i] === w[i - 2] && w[i - 1] === w[i - 3] && w[i] !== w[i - 1]) {
      restarts++;
      if (examples.length < 6) examples.push({ kind: 'restart', text: snippet(i - 3, 4) });
      i++;
    }
  }
  return { repetitions, restarts, examples };
}

const LINKERS = ['because', 'so', 'however', 'although', 'therefore', 'but', 'which', 'while', 'whereas', 'since',
  'for example', 'for instance', 'on the other hand', 'in addition', 'moreover', 'firstly', 'secondly', 'finally', 'in conclusion', 'unless', 'if'];

// How sentences are built: which joining words appear and how varied they are.
function sentenceSignals(text) {
  const lower = ` ${words(text).join(' ')} `;
  const used = LINKERS.filter(l => lower.includes(` ${l} `));
  const and = (lower.match(/ and /g) || []).length;
  const total = words(text).length;
  return {
    linkers_used: used,
    linker_variety: used.length,
    and_ratio: total ? Math.round((and / total) * 1000) / 10 : 0, // "and" per 100 words: run-on signal
  };
}

// Argument-strength signals for the offline verdict.
function argumentSignals(text) {
  const lower = ` ${words(text).join(' ')} `;
  const has = (list) => list.reduce((n, p) => n + (lower.split(` ${p} `).length - 1), 0);
  return {
    reasons: has(['because', 'since', 'so', 'therefore', 'this means']),
    examples: has(['for example', 'for instance', 'such as', 'like when']) + (text.match(/\d+/g) || []).length,
    rebuttals: has(['but', 'however', 'you said', 'my opponent', 'i disagree', 'that is not', 'although']),
    words: words(text).length,
  };
}

module.exports = {
  words, sentences, contentWords, detectIssues, tidySentence, estimateSceneFeedback, countFillers, clamp, FILLERS,
  disfluency, sentenceSignals, argumentSignals,
};
