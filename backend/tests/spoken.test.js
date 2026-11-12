const H = require('../src/services/heuristics');

describe('spoken-English signals', () => {
  test('repeated words count once per run; correct doubles are ignored', () => {
    const d = H.disfluency('I I think and and and we had had enough of that that idea');
    expect(d.repetitions).toBe(2);
    expect(d.examples.map(e => e.text)).toEqual(['i i think', 'think and and and we']);
  });

  test('restarted phrases are detected', () => {
    const d = H.disfluency('we should we should ban it');
    expect(d.restarts).toBe(1);
    expect(d.examples[0].kind).toBe('restart');
  });

  test('sentence signals list linking words', () => {
    const s = H.sentenceSignals('It is bad because kids get tired. However, for example, sport helps.');
    expect(s.linkers_used).toEqual(expect.arrayContaining(['because', 'however', 'for example']));
  });

  test('argument signals reward reasons, examples and rebuttals', () => {
    const strong = H.argumentSignals('But you said cost. However, for example 3 schools saved money because buses are cheaper.');
    const weak = H.argumentSignals('I like it. It is nice.');
    expect(strong.reasons + strong.examples + strong.rebuttals).toBeGreaterThan(weak.reasons + weak.examples + weak.rebuttals);
  });
});
