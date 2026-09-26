import assert from 'node:assert/strict';
import questionFlows from '../data/questions.json' with { type: 'json' };
import { clarifierForQuestion, questionContext, CLARIFIER_QUESTION_IDS } from '../src/question-guidance.js';
import { inferClarifiedAnswer } from '../src/core.js';

const addition = questionFlows.find(flow => flow.id === 'addition');
const lotEra = addition.questions.find(question => question.id === 'zoningLotEra');
const roofType = addition.questions.find(question => question.id === 'zoningRoofType');

assert.equal(clarifierForQuestion(lotEra), null, 'lot era uncertainty must not produce a meaningless yes/no clarifier');
assert.equal(clarifierForQuestion(roofType), null, 'roof uncertainty must not produce a meaningless yes/no clarifier');
assert.match(questionContext(lotEra, {yearBuilt: 1942}), /building year as 1942/i);
assert.match(questionContext(lotEra, {yearBuilt: 1942}), /not the same as the date the legal lot was created/i);
assert.match(questionContext(roofType), /compare both published height limits/i);

for (const flow of questionFlows) {
  for (const question of flow.questions) {
    const offersUnsure = question.options?.some(([value]) => value === 'unsure');
    if (!offersUnsure || !CLARIFIER_QUESTION_IDS.includes(question.id)) continue;
    const clarifier = clarifierForQuestion(question);
    assert.ok(clarifier, `${flow.id}.${question.id} must have its declared clarifier`);
    for (const [value] of clarifier.options) {
      assert.ok(inferClarifiedAnswer(question.id, clarifier.kind === 'multi' ? [value] : value), `${question.id}:${value} must infer the original answer`);
    }
  }
}

console.log('question guidance tests passed');