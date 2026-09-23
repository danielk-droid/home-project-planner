import assert from 'node:assert/strict';
import {validateFeedbackPayload} from '../api/feedback.js';

const valid = {
  role: 'Homeowner',
  project: 'Planning a home project',
  usefulness: 'Very useful',
  newInformation: 'Yes',
  feedback: 'The project path was clear.',
  contactEmail: ''
};

assert.equal(validateFeedbackPayload(valid).ok, true);

for (const field of ['role','project','usefulness','newInformation','feedback']) {
  const copy = {...valid};
  delete copy[field];
  assert.equal(validateFeedbackPayload(copy).ok, false, field);
}

assert.equal(
  validateFeedbackPayload({...valid, contactEmail:'not-an-email'}).ok,
  false
);

assert.equal(
  validateFeedbackPayload(null).ok,
  false
);

assert.equal(
  validateFeedbackPayload({...valid, website:'bot'}).ok,
  false
);

assert.equal(
  validateFeedbackPayload({...valid, extra:'should not be forwarded'}).ok,
  true
);

const normalized = validateFeedbackPayload({...valid, feedback:'  specific feedback  '});
assert.equal(normalized.value.feedback, 'specific feedback');

console.log('feedback validation tests: PASS');
