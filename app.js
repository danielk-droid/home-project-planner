import {PROJECTS, resolveProperty, buildPlan, getQuestions, sourcesFor} from './src/core.js';

const $ = id => document.getElementById(id);
let property = null;
let type = null;
let answers = {};
let questionIndex = 0;

const addressInput = $('address');
const suggestions = $('addressSuggestions');
let suggestionTimer = null;
let suggestionRequest = 0;

addressInput.addEventListener('input', () => {
  const value = addressInput.value.trim();
  clearTimeout(suggestionTimer);
  if (!value) {
    suggestions.innerHTML = '';
    suggestions.classList.add('hidden');
    return;
  }
  suggestionTimer = setTimeout(async () => {
    const request = ++suggestionRequest;
    try {
      const matches = await searchAddresses(value);
      if (request !== suggestionRequest) return;
      renderSuggestions(matches);
    } catch {
      suggestions.innerHTML = '<div class="suggestion-empty">Address search is temporarily unavailable. You can still try the full address.</div>';
      suggestions.classList.remove('hidden');
    }
  }, 160);
});

addressInput.addEventListener('keydown', e => {
  if (e.key === 'Escape') suggestions.classList.add('hidden');
  if (e.key === 'Enter' && suggestions.querySelector('[role="option"]')) {
    e.preventDefault();
    suggestions.querySelector('[role="option"]').click();
  }
});

document.addEventListener('click', e => {
  if (!e.target.closest('.address-wrap')) suggestions.classList.add('hidden');
});

async function searchAddresses(value) {
  const u = new URL('https://gisweb.newtonma.gov/server/rest/services/Data/MapServer/12/query');
  u.searchParams.set('where', `UPPER(Address) LIKE UPPER('${value.replace(/'/g, "''")}%')`);
  u.searchParams.set('outFields', 'Address,AddressID,Number,NumberSuffix,FullStName,City,ZipCode');
  u.searchParams.set('orderByFields', 'Address ASC');
  u.searchParams.set('resultRecordCount', '8');
  u.searchParams.set('returnGeometry', 'false');
  u.searchParams.set('f', 'json');
  const res = await fetch(u);
  if (!res.ok) throw new Error('Address search failed');
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'Address search failed');
  return (data.features || []).map(f => f.attributes).filter(x => x.Address);
}

function renderSuggestions(matches) {
  suggestions.innerHTML = matches.length
    ? matches.map(x => `<button type="button" class="suggestion" role="option" data-address="${escape(x.Address)}"><strong>${escape(x.Address)}</strong><span>${escape(x.City || 'Newton')}${x.ZipCode ? ' · ' + escape(x.ZipCode) : ''}</span></button>`).join('')
    : '<div class="suggestion-empty">No official Newton GIS address matches yet.</div>';
  suggestions.classList.remove('hidden');
  suggestions.querySelectorAll('.suggestion').forEach(btn => {
    btn.onclick = () => {
      addressInput.value = btn.dataset.address;
      suggestions.classList.add('hidden');
      $('resolve').focus();
    };
  });
}

$('resolve').onclick = async () => {
  $('error').classList.add('hidden');
  $('resolve').disabled = true;
  $('resolve').textContent = 'Checking property…';
  try {
    property = await resolveProperty(addressInput.value);
    type = $('projectType').value;
    answers = {};
    questionIndex = 0;
    renderQuestions();
  } catch (e) {
    $('error').textContent = e.message;
    $('error').classList.remove('hidden');
  } finally {
    $('resolve').disabled = false;
    $('resolve').textContent = 'Check property & continue';
  }
};

function renderQuestions() {
  $('start').classList.add('hidden');
  const q = $('questions');
  q.classList.remove('hidden');
  q.innerHTML = propertyHeader() + '<div id="questionCard"></div>';
  renderQuestionCard();
}

function propertyHeader() {
  return `<div class="eyebrow">PROPERTY FOUND</div>
    <h2>${escape(property.resolvedAddress)}</h2>
    <div class="facts compact-facts">${property.evidence.map(x => `<span><b>${escape(x.label)}</b>${escape(String(x.value))}</span>`).join('')}</div>
    <div class="notice"><b>We ask only what can change the plan.</b> If you do not know an answer, choose “I'm not sure.” We will ask clarifying questions instead of making you guess.</div>`;
}

function renderQuestionCard() {
  const all = getQuestions(type, answers);
  const card = $('questionCard');
  if (questionIndex >= all.length) {
    renderReview(all);
    return;
  }
  const q = all[questionIndex];
  const progress = Math.round(((questionIndex) / all.length) * 100);
  const current = answers[q.id];
  card.innerHTML = `<div class="question-progress"><span>Question ${questionIndex + 1} of ${all.length}</span><span>${progress}%</span></div>
    <div class="progress"><div style="width:${progress}%"></div></div>
    <div class="question-card">
      <div class="eyebrow">PROJECT SCOPE</div>
      <h1>${escape(q.text)}</h1>
      ${q.kind === 'choice' ? choiceControl(q, current) : q.kind === 'text' ? textControl(q, current) : numberControl(q, current)}
      <div id="questionHint" class="small hint">${q.kind === 'choice' && q.options.some(o => o[0] === 'unsure') ? 'Not sure? That is a valid answer. We will narrow it down with follow-up questions.' : 'An estimate is fine when the exact number is not known yet.'}</div>
      <div class="question-actions">
        <button type="button" id="backQuestion" class="secondary" ${questionIndex === 0 ? 'disabled' : ''}>Back</button>
        <button type="button" id="nextQuestion">${questionIndex === all.length - 1 ? 'Review my answers' : 'Continue'}</button>
      </div>
    </div>`;
  $('backQuestion').onclick = () => {
    if (questionIndex > 0) {
      questionIndex--;
      renderQuestionCard();
    }
  };
  $('nextQuestion').onclick = () => {
    const value = readQuestionValue(q);
    if (value === undefined) {
      $('questionHint').textContent = q.kind === 'number' ? 'Enter an estimate or use 0 if the answer is genuinely zero.' : 'Choose an answer to continue.';
      $('questionHint').classList.add('validation');
      return;
    }
    answers[q.id] = value;
    // Recompute visibility after every answer. This is what makes the
    // questionnaire adaptive rather than a fixed checklist.
    const nextAll = getQuestions(type, answers);
    questionIndex++;
    if (questionIndex > nextAll.length) questionIndex = nextAll.length;
    renderQuestionCard();
  };
}

function choiceControl(q, current) {
  return `<div class="choice-list">${q.options.map(([value,label]) => `<label class="choice ${current === value ? 'selected' : ''}"><input type="radio" name="questionChoice" value="${escape(value)}" ${current === value ? 'checked' : ''}><span>${escape(label)}</span></label>`).join('')}</div>`;
}

function numberControl(q, current) {
  return `<div class="number-wrap"><input id="questionNumber" type="number" min="${q.min ?? 0}" ${q.max != null ? 'max="' + q.max + '"' : ''} step="any" value="${current ?? ''}" placeholder="Enter an estimate"><span>${escape(q.unit || '')}</span></div>`;
}

function textControl(q, current) {
  return `<div class="text-wrap"><textarea id="questionText" rows="4" maxlength="500" placeholder="Describe it briefly">${escape(current ?? '')}</textarea></div>`;
}

function readQuestionValue(q) {
  if (q.kind === 'choice') return document.querySelector('input[name="questionChoice"]:checked')?.value;
  if (q.kind === 'text') {
    const value = $('questionText')?.value.trim();
    return value || undefined;
  }
  const raw = $('questionNumber')?.value.trim();
  if (raw === '') return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < (q.min ?? 0) || (q.max != null && value > q.max)) return undefined;
  return value;
}

function renderReview(all) {
  const card = $('questionCard');
  const unanswered = all.filter(q => answers[q.id] === undefined);
  if (unanswered.length) {
    questionIndex = all.indexOf(unanswered[0]);
    renderQuestionCard();
    return;
  }
  const unsure = all.filter(q => answers[q.id] === 'unsure');
  card.innerHTML = `<div class="eyebrow">READY TO PLAN</div>
    <h1>Review your project</h1>
    <p class="muted">You can go back and change any answer. “I'm not sure” answers will be carried into the plan as items to clarify, not treated as facts.</p>
    <div class="review-list">${all.map(q => `<div><span>${escape(q.text)}</span><b>${escape(formatAnswer(q, answers[q.id]))}</b></div>`).join('')}</div>
    ${unsure.length ? '<div class="notice"><b>' + unsure.length + ' answer' + (unsure.length === 1 ? '' : 's') + ' still need clarification.</b> The planner will identify what those uncertainties affect.</div>' : ''}
    <div class="question-actions"><button type="button" id="backQuestion" class="secondary">Back</button><button type="button" id="generatePlan">Generate project plan</button></div>`;
  $('backQuestion').onclick = () => { questionIndex = Math.max(0, all.length - 1); renderQuestionCard(); };
  $('generatePlan').onclick = () => renderResult(buildPlan(type, property, answers));
}

function formatAnswer(q, value) {
  if (value === 'yes') return 'Yes';
  if (value === 'no') return 'No';
  if (value === 'unsure') return "I'm not sure";
  if (value == null) return 'Not provided';
  return q.unit ? `${value} ${q.unit}` : String(value);
}

function renderResult(plan) {
  $('questions').classList.add('hidden');
  const r = $('result');
  r.classList.remove('hidden');
  const savedKey = 'nhpp-project';
  const saved = JSON.parse(localStorage.getItem(savedKey) || 'null');
  if (saved?.steps) plan.steps = plan.steps.map((x, i) => ({...x, status: saved.steps[i]?.status || 'not_started'}));
  localStorage.setItem(savedKey, JSON.stringify({type, property, answers, steps:plan.steps, updatedAt:new Date().toISOString()}));

  const required = plan.required;
  const conditional = plan.conditional;
  const confirm = plan.confirm;
  const statusClass = s => s === 'required' ? 'required' : s === 'potentially_required' ? 'conditional' : 'confirm';

  r.innerHTML = `
    <section class="panel"><div class="eyebrow">PROJECT PLAN</div><h1>${escape(PROJECTS[type].label)}</h1>
      <p class="muted">${escape(property.resolvedAddress)} · ${escape(property.zoningDistrict || 'Zoning not resolved')}</p>
      <div class="notice"><b>This is a planning aid, not permit approval or a code-compliance determination.</b> Verified property facts are separated from conditional conclusions and questions that still need confirmation.</div>
    </section>
    ${sectionFor('What appears to apply', required, statusClass)}
    ${sectionFor('What may apply depending on the project', conditional, statusClass)}
    ${sectionFor('What still needs to be clarified', confirm, statusClass)}
    <section class="panel"><h2>Information to prepare</h2>
      <p class="muted">The City may require additional project-specific information or documents during review. This list is a preparation guide, not a guarantee of completeness.</p>
      <ul class="prep-list">${preparationItems(plan).map(x => '<li>' + escape(x) + '</li>').join('')}</ul>
    </section>
    <section class="panel"><h2>Project sequence</h2>
      <p class="small">A planning sequence. Dependencies indicate what should be understood before the next stage; they are not a City-issued schedule.</p>
      <ol class="steps">${plan.steps.map((s,i) => `<li><label class="stepcheck"><input data-step="${i}" type="checkbox" ${s.status === 'complete' ? 'checked' : ''}> <b>${i+1}. ${escape(s.title)}</b></label><span>Depends on: ${s.dependsOn.length ? s.dependsOn.join(', ') : 'project scope'}</span></li>`).join('')}</ol>
    </section>
    <section class="panel"><h2>Questions to confirm with Newton</h2>
      ${confirm.length ? '<div class="confirmation-list">' + confirm.map(x => `<article><h3>${escape(x.title)}</h3><p>${escape(x.action)}</p><div class="sources">${sourcesFor(x).map(s => `<a href="${s.url}" target="_blank" rel="noreferrer">${escape(s.title)}</a>`).join('')}</div></article>`).join('') + '</div>' : '<p>No unresolved rule conditions were generated from the answers. You should still follow the City’s current application instructions.</p>'}
    </section>
    <section class="panel"><h2>Property evidence</h2><div class="facts">${property.evidence.map(x => `<span><b>${escape(x.label)}</b>${escape(String(x.value))}</span>`).join('')}</div>
      <p class="small">Property facts shown here come from Newton's official GIS layers. GIS evidence does not by itself determine permit approval.</p>
    </section>
    <div class="result-actions"><button id="editProject" class="secondary">Edit project answers</button><button id="printPlan" class="secondary">Print / save plan</button><button id="restart">Start another project</button></div>`;

  document.querySelectorAll('[data-step]').forEach(cb => cb.onchange = () => {
    const current = JSON.parse(localStorage.getItem(savedKey) || '{}');
    current.steps = current.steps || plan.steps;
    current.steps[Number(cb.dataset.step)].status = cb.checked ? 'complete' : 'not_started';
    current.updatedAt = new Date().toISOString();
    localStorage.setItem(savedKey, JSON.stringify(current));
  });
  $('printPlan').onclick = () => window.print();
  $('editProject').onclick = () => {
    $('result').classList.add('hidden');
    $('questions').classList.remove('hidden');
    questionIndex = 0;
    renderQuestions();
  };
  $('restart').onclick = () => location.reload();
}

function preparationItems(plan) {
  const items = new Set([
    'Clear description of the proposed work and affected rooms/areas',
    'Existing and proposed plans or drawings appropriate to the project'
  ]);
  for (const result of plan.results) for (const item of (result.preparation || [])) items.add(item);
  return [...items];
}

function sectionFor(title, results, statusClass) {
  if (!results.length) return '';
  return `<section class="panel"><h2>${escape(title)}</h2>${results.map(x => `<article class="result ${statusClass(x.status)}"><div><span class="badge">${x.status.replaceAll('_',' ')}</span><h3>${escape(x.title)}</h3><p>${escape(x.action)}</p><p class="small">${escape(x.explanation || '')}</p></div><div class="sources">${sourcesFor(x).map(s => `<a href="${s.url}" target="_blank" rel="noreferrer">${escape(s.title)}</a>`).join('')}</div></article>`).join('')}</section>`;
}

function escape(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
