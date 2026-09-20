import {PROJECTS, resolveProperty, buildPlan, getQuestions, sourcesFor} from './src/core.js';

const $ = id => document.getElementById(id);
let property = null;
let type = null;
let answers = {};
let questionIndex = 0;

const pageIds = ['home','about','mission','feedback','plan'];
const addressInput = $('address');
const suggestions = $('addressSuggestions');
let suggestionTimer = null;
let suggestionRequest = 0;

function navigate(page) {
  const target = page === 'home' ? 'home' : page;
  pageIds.forEach(id => {
    const el = $(id);
    if (el) el.classList.toggle('page-active', id === target);
  });
  document.querySelectorAll('[data-page-link]').forEach(link => {
    link.classList.toggle('active', link.dataset.pageLink === target || (target === 'plan' && link.dataset.pageLink === 'home'));
  });
  if (target === 'plan') {
    $('home').classList.remove('page-active');
    $('plan').classList.add('page-active');
    document.body.classList.remove('focus-mode');
    window.scrollTo({top:0,behavior:'smooth'});
  } else {
    document.body.classList.remove('focus-mode');
    window.scrollTo({top:0,behavior:'smooth'});
  }
}

function routeFromHash() {
  const hash = location.hash.replace('#','') || 'home';
  if (['about','mission','feedback','plan'].includes(hash)) navigate(hash);
  else navigate('home');
}

document.querySelectorAll('[data-page-link]').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    const page = link.dataset.pageLink;
    history.pushState(null,'','#' + page);
    navigate(page);
    closeMobileMenu();
  });
});
window.addEventListener('popstate', routeFromHash);
window.addEventListener('hashchange', routeFromHash);
routeFromHash();

function openMobileMenu() {
  $('mobileMenu')?.classList.add('open');
  $('mobileMenu')?.setAttribute('aria-hidden','false');
}
function closeMobileMenu() {
  $('mobileMenu')?.classList.remove('open');
  $('mobileMenu')?.setAttribute('aria-hidden','true');
}
$('menuToggle')?.addEventListener('click', openMobileMenu);
$('mobileMenuClose')?.addEventListener('click', closeMobileMenu);
$('mobileMenu')?.querySelectorAll('[data-page-link]').forEach(link => link.addEventListener('click', closeMobileMenu));

if (addressInput) {
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
}

document.addEventListener('click', e => {
  if (!e.target.closest('.address-wrap')) suggestions?.classList.add('hidden');
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
    history.pushState(null,'','#plan');
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
  document.body.classList.add('focus-mode');
  pageIds.forEach(id => $(id)?.classList.remove('page-active'));
  $('plan').classList.add('page-active');
  const q = $('questions');
  q.classList.remove('hidden');
  q.innerHTML = propertyHeader() + '<div id="questionCard"></div>';
  renderQuestionCard();
  window.scrollTo({top:0,behavior:'smooth'});
}

function propertyHeader() {
  return `<div class="eyebrow">PROPERTY FOUND</div>
    <h2>${escape(property.resolvedAddress)}</h2>
    <div class="facts compact-facts">${property.evidence.map(x => `<span><b>${escape(x.label)}</b><strong>${escape(String(x.value))}</strong></span>`).join('')}</div>
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
    const visibleIds = new Set(getQuestions(type, answers).map(x => x.id));
    for (const key of Object.keys(answers)) {
      if (!visibleIds.has(key)) delete answers[key];
    }
    const nextAll = getQuestions(type, answers);
    questionIndex++;
    if (questionIndex >= nextAll.length) questionIndex = nextAll.length;
    renderQuestionCard();
    window.scrollTo({top:0,behavior:'smooth'});
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
  $('generatePlan').onclick = () => {
    renderResult(buildPlan(type, property, answers));
  };
}

function formatAnswer(q, value) {
  if (value === 'yes') return 'Yes';
  if (value === 'no') return 'No';
  if (value === 'unsure') return "I'm not sure";
  if (value == null) return 'Not provided';
  return q.unit ? `${value} ${q.unit}` : String(value);
}

function projectSaveKey() {
  return 'nhpp-project:' + type + ':' + (property?.resolvedAddress || '');
}

const stepGuidance = {
  property: {
    label:'Confirm the property',
    description:'Verify the address, parcel, and location-specific information before relying on project requirements.',
    sourceId:'newton-gis'
  },
  scope: {
    label:'Confirm the project scope',
    description:'Make the proposed work specific enough to determine which reviews, plans, and permits may apply.',
    sourceId:'newton-building-checklist'
  },
  site: {
    label:'Check site-specific reviews',
    description:'Check zoning, historic, tree, conservation, floodplain, and other property conditions that can change the project path.',
    sourceId:'newton-planning'
  },
  applications: {
    label:'Prepare and submit applications',
    description:'Use the City’s current application instructions and prepare the plans and supporting documents required for your project.',
    sourceId:'newton-newgov'
  },
  inspections: {
    label:'Complete required inspections',
    description:'Request inspections at the appropriate stages and keep inspection records and trade signoffs.',
    sourceId:'newton-inspections'
  },
  final: {
    label:'Complete final inspection and signoffs',
    description:'Finish required inspections and assemble final documentation before treating the project as complete.',
    sourceId:'newton-final-checklist'
  },
  closeout: {
    label:'Close permits / project',
    description:'Confirm required final documents are complete and follow Newton’s process for closing open permits.',
    sourceId:'newton-closeout'
  }
};

const sourceById = id => ({
  'newton-gis':'https://www.newtonma.gov/government/information-technology/gis',
  'newton-building-checklist':'https://www.newtonma.gov/home/showpublisheddocument/29379/638630352968235564',
  'newton-planning':'https://www.newtonma.gov/government/planning',
  'newton-newgov':'https://www.newtonma.gov/government/planning/resources/applications-forms-and-brochures',
  'newton-inspections':'https://www.newtonma.gov/government/inspectional-services/inspection-requests-2376',
  'newton-final-checklist':'https://www.newtonma.gov/home/showpublisheddocument/29413/639029479026700000',
  'newton-closeout':'https://www.newtonma.gov/government/inspectional-services/how-to-close-open-permits'
}[id]);

function renderResult(plan) {
  $('questions').classList.add('hidden');
  document.body.classList.add('focus-mode');
  const r = $('result');
  r.classList.remove('hidden');
  const savedKey = projectSaveKey();
  const saved = JSON.parse(localStorage.getItem(savedKey) || 'null');
  if (saved?.steps) plan.steps = plan.steps.map((x, i) => ({...x, status: saved.steps[i]?.status || 'not_started'}));
  localStorage.setItem(savedKey, JSON.stringify({type, property, answers, steps:plan.steps, updatedAt:new Date().toISOString()}));

  const statusClass = s => s === 'required' ? 'required' : s === 'potentially_required' ? 'conditional' : 'confirm';

  r.innerHTML = `
    <section class="plan-hero">
      <div><div class="eyebrow">PROJECT PLAN</div><h1>${escape(PROJECTS[type].label)}</h1><p>${escape(property.resolvedAddress)} · ${escape(property.zoningDistrict || 'Zoning not resolved')}</p></div>
      <div class="plan-hero-index">01<br><span>PLANNING CONTROL</span></div>
    </section>
    ${checklistSection(plan)}
    ${nextActionsSection(plan)}
    ${sectionFor('What appears to apply', plan.required, statusClass)}
    ${sectionFor('What may apply depending on the project', plan.conditional, statusClass)}
    ${sectionFor('What still needs to be clarified', plan.confirm, statusClass)}
    <section class="panel"><div class="section-heading"><div><div class="eyebrow">PREPARE</div><h2>Information to prepare</h2></div></div>
      <p class="muted">Use this as a preparation guide. The City may require additional project-specific information during review.</p>
      <ul class="prep-list">${preparationItems(plan).map(x => '<li>' + escape(x) + '</li>').join('')}</ul>
    </section>
    <section class="panel"><div class="section-heading"><div><div class="eyebrow">PROPERTY</div><h2>Property evidence</h2></div><span class="small">Official Newton GIS context</span></div>
      <div class="facts">${property.evidence.map(x => `<span><b>${escape(x.label)}</b><strong>${escape(String(x.value))}</strong></span>`).join('')}</div>
      <p class="small">These facts come from Newton’s official GIS layers. GIS evidence does not by itself determine permit approval.</p>
    </section>
    <div class="result-actions"><button id="editProject" class="secondary">Edit project answers</button><button id="printPlan" class="secondary">Print / save plan</button><button id="restart">Start another project</button></div>
    <div id="completionToast" class="completion-toast hidden" role="status" aria-live="polite"><strong>Project sequence complete.</strong><span>You’ve checked every planning step. Keep following the City’s current instructions and approvals.</span></div>
    <div id="confetti" class="confetti" aria-hidden="true"></div>`;

  document.querySelectorAll('[data-step]').forEach(cb => cb.onchange = () => {
    const current = JSON.parse(localStorage.getItem(savedKey) || '{}');
    current.steps = current.steps || plan.steps;
    current.steps[Number(cb.dataset.step)].status = cb.checked ? 'complete' : 'not_started';
    current.updatedAt = new Date().toISOString();
    localStorage.setItem(savedKey, JSON.stringify(current));
    updateCompletion(plan);
  });

  $('printPlan').onclick = () => window.print();
  $('editProject').onclick = () => {
    r.classList.add('hidden');
    $('questions').classList.remove('hidden');
    questionIndex = 0;
    renderQuestions();
  };
  $('restart').onclick = () => location.reload();
  window.scrollTo({top:0,behavior:'smooth'});
  updateCompletion(plan);
}

function checklistSection(plan) {
  return `<section class="panel checklist-panel">
    <div class="section-heading"><div><div class="eyebrow">WORKFLOW</div><h2>Your project checklist</h2><p class="muted">Work through these stages in order. Each item includes the reason it matters and a direct official starting point.</p></div><span class="check-count" id="checkCount">0 / ${plan.steps.length}</span></div>
    <ol class="steps">${plan.steps.map((s,i) => {
      const g = stepGuidance[s.id] || stepGuidance.scope;
      const url = sourceById(g.sourceId);
      return `<li class="step-item"><label class="stepcheck"><input data-step="${i}" type="checkbox" ${s.status === 'complete' ? 'checked' : ''}> <b>${i+1}. ${escape(s.title)}</b></label>
        <span class="step-depends">Depends on: ${s.dependsOn.length ? s.dependsOn.join(', ') : 'project scope'}</span>
        <details><summary>How to complete this step</summary><p>${escape(g.description)}</p><a class="guidance-button" href="${url}" target="_blank" rel="noreferrer">Open official guidance ↗</a></details>
      </li>`;
    }).join('')}</ol>
  </section>`;
}

function updateCompletion(plan) {
  const boxes = [...document.querySelectorAll('[data-step]')];
  const done = boxes.filter(x => x.checked).length;
  const count = $('checkCount');
  if (count) count.textContent = `${done} / ${boxes.length}`;
  if (done === boxes.length && boxes.length) {
    $('completionToast')?.classList.remove('hidden');
    launchConfetti();
  } else {
    $('completionToast')?.classList.add('hidden');
  }
}

let confettiRunning = false;
function launchConfetti() {
  if (confettiRunning) return;
  confettiRunning = true;
  const root = $('confetti');
  if (!root) { confettiRunning = false; return; }
  root.innerHTML = '';
  for (let i=0;i<26;i++) {
    const piece = document.createElement('i');
    piece.style.setProperty('--x', (Math.random()*100) + '%');
    piece.style.setProperty('--delay', (Math.random()*.35) + 's');
    piece.style.setProperty('--rot', (Math.random()*360) + 'deg');
    root.appendChild(piece);
  }
  setTimeout(() => { root.innerHTML=''; confettiRunning=false; }, 1700);
}

function nextActionsSection(plan) {
  const items = [];
  for (const x of plan.confirm) items.push(x);
  for (const x of plan.required) items.push(x);
  const shown = items.slice(0,5);
  if (!shown.length) return '';
  return '<section class="panel next-actions"><div class="section-heading"><div><div class="eyebrow">START HERE</div><h2>Next actions</h2><p class="muted">These are the first items to resolve. Each one has a direct starting point so you know how to act on it.</p></div></div>' +
    '<ol>' + shown.map((x,i) => {
      const src = sourcesFor(x)[0];
      return '<li><span class="next-number">0' + (i+1) + '</span><div><b>' + escape(x.title) + '</b><p>' + escape(x.action) + '</p>' +
        (src ? '<a class="guidance-button" href="' + escape(src.url) + '" target="_blank" rel="noreferrer">Open ' + escape(src.title) + ' ↗</a>' : '') +
        '</div></li>';
    }).join('') + '</ol>' + (items.length > shown.length ? '<p class="small">More requirements and guidance are below.</p>' : '') + '</section>';
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
  return `<section class="panel requirement-section"><div class="section-heading"><div><div class="eyebrow">REQUIREMENTS</div><h2>${escape(title)}</h2></div></div>
  ${results.map(x => {
    const sources = sourcesFor(x);
    return `<article class="result ${statusClass(x.status)}"><div class="result-main"><span class="badge">${x.status.replaceAll('_',' ')}</span><h3>${escape(x.title)}</h3><p>${escape(x.action)}</p><p class="small">${escape(x.explanation || '')}</p>
      ${sources.length ? '<div class="result-guidance"><span>How to handle this</span>' + sources.map(s => '<a class="guidance-button" href="' + escape(s.url) + '" target="_blank" rel="noreferrer">Open ' + escape(s.title) + ' ↗</a>').join('') + '</div>' : ''}
    </div></article>`;
  }).join('')}</section>`;
}

function escape(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
