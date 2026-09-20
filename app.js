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

const heroGraphic = document.querySelector('.hero-graphic');
const heroStart = $('heroStart');
if (heroGraphic && heroStart) {
  const lessonDot = document.createElement('span');
  lessonDot.className = 'lesson-dot';
  lessonDot.setAttribute('aria-hidden','true');
  document.body.appendChild(lessonDot);
  heroGraphic.classList.add('dot-lesson');
  setTimeout(() => {
    const dot = heroGraphic.querySelector('.site-point');
    const a = dot.getBoundingClientRect();
    const b = heroStart.getBoundingClientRect();
    const startX = a.left + a.width/2;
    const startY = a.top + a.height/2;
    const endX = b.left + b.width*.52;
    const endY = b.top + b.height*.52;
    lessonDot.style.left = startX + 'px';
    lessonDot.style.top = startY + 'px';
    lessonDot.classList.add('fly');
    lessonDot.style.setProperty('--end-x', endX + 'px');
    lessonDot.style.setProperty('--end-y', endY + 'px');
    setTimeout(() => {
      lessonDot.classList.add('arrived');
      heroStart.classList.add('guided-click');
      setTimeout(() => { heroStart.classList.remove('guided-click'); lessonDot.remove(); }, 900);
    }, 850);
  }, 3600);
}

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
    <p class="muted">Everything below is editable. Select <b>Edit</b> beside any answer to jump directly to that question.</p>
    <div class="review-list review-edit-list">${all.map((q,i) => `<div><span>${escape(q.text)}</span><b>${escape(formatAnswer(q, answers[q.id]))}</b><button type="button" class="review-edit" data-edit-question="${i}">Edit</button></div>`).join('')}</div>
    ${unsure.length ? '<div class="notice"><b>' + unsure.length + ' answer' + (unsure.length === 1 ? '' : 's') + ' still need clarification.</b> The planner will identify what those uncertainties affect.</div>' : ''}
    <div class="question-actions"><button type="button" id="backQuestion" class="secondary">Back</button><button type="button" id="generatePlan">Generate project plan</button></div>`;
  document.querySelectorAll('[data-edit-question]').forEach(btn => btn.onclick = () => {
    questionIndex = Number(btn.dataset.editQuestion);
    renderQuestionCard();
    window.scrollTo({top:0,behavior:'smooth'});
  });
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
    description:'Confirm that the address and parcel identified by the planner are the property you intend to work on. Use Newton GIS/Assessing tools to check the parcel and property record before relying on site-specific requirements.',
    sourceId:'newton-gis',
    where:'Open Newton GIS and use the property/address search. From there, review the parcel record and available property layers.'
  },
  scope: {
    description:'Write down exactly what you are changing: rooms, exterior work, added area, structural work, utilities, and whether the work changes the building footprint. This determines which reviews and permit materials can be relevant.',
    sourceId:'newton-planning',
    where:'Start with Planning & Development and review Planning Applications, Zoning review, and the Building Permit pathway. Then use the application instructions that match your project.'
  },
  site: {
    description:'Check the property conditions that can change the project path: zoning, historic status, trees, wetlands/conservation, floodplain, setbacks, and other site constraints.',
    sourceId:'newton-zoning',
    where:'For zoning, use Newton’s interactive zoning map or the Planning & Development zoning resources. For historic, conservation, and tree issues, use the corresponding City department pages linked below.'
  },
  applications: {
    description:'Prepare the application, drawings, and supporting documents required for the reviews that apply to this project, then submit them through the City’s current online process.',
    sourceId:'newton-planning',
    where:'Planning applications and building permits are submitted through NewGov. The Planning & Development page explains the application categories and links to the current application system.'
  },
  inspections: {
    description:'Schedule inspections at the stages required for the work and keep the inspection results and trade signoffs with the project record. Do not close up work that still needs to be inspected.',
    sourceId:'newton-inspections',
    where:'Use Newton Inspectional Services’ inspection-request instructions to determine how to request the inspections for your permit.'
  },
  final: {
    description:'Finish the final inspections and required signoffs, then confirm that the permit record contains the required final documentation before treating the project as complete.',
    sourceId:'newton-final-checklist',
    where:'Use the City’s final inspection/checklist guidance and the permit record to verify that required inspections and documents are complete.'
  },
  closeout: {
    description:'Check for open permits or unfinished requirements and complete the City’s closeout process so the project record is not left incomplete.',
    sourceId:'newton-closeout',
    where:'Use Newton’s open-permit search/closeout guidance. If a permit cannot be closed from the available instructions, contact Inspectional Services for the specific record.'
  }
};

const sourceById = id => ({
  'newton-gis':'https://www.newtonma.gov/government/information-technology/gis',
  'newton-zoning':'https://www.newtonma.gov/about/city-maps-available-for-download',
  'newton-planning':'https://www.newtonma.gov/government/planning',
  'newton-newgov':'https://newtonma.portal.opengov.com/categories/1086',
  'newton-fire':'https://www.newtonma.gov/government/fire/fire-prevention/plan-reviews',
  'newton-tree':'https://www.newtonma.gov/government/parks-recreation-culture/urban-forestry/tree-preservation-ordinance',
  'newton-conservation':'https://www.newtonma.gov/government/planning/divisions/conservation-office/wetlands-permitting-rev',
  'newton-historic':'https://www.newtonma.gov/government/planning/historic-preservation',
  'newton-inspections':'https://www.newtonma.gov/government/inspectional-services',
  'newton-final-checklist':'https://www.newtonma.gov/government/inspectional-services/inspection-requests-2376',
  'newton-closeout':'https://www.newtonma.gov/government/inspectional-services/how-to-close-open-permits'
}[id]);

function guidanceForRequirement(x) {
  const t = (x.title + ' ' + x.action + ' ' + (x.explanation || '')).toLowerCase();
  if (t.includes('fire')) return {sourceId:'newton-fire', where:'On the Fire Department Plan Reviews page, use the Residential Plan Review (1–6 dwelling units) section and the NewGov submission link. Residential building permit applications are reviewed by Newton Fire.'};
  if (t.includes('zoning') || t.includes('setback') || t.includes('far') || t.includes('lot coverage')) return {sourceId:'newton-zoning', where:'On Planning & Development, use the zoning resources and the Zoning review application. The City’s interactive zoning map is also linked from its map resources.'};
  if (t.includes('tree')) return {sourceId:'newton-tree', where:'On the Tree Preservation Ordinance page, look for Tree Permit Application – Construction and the Tree Save Area requirements. Exterior construction can require a Tree Permit even when no tree is being removed.'};
  if (t.includes('historic')) return {sourceId:'newton-historic', where:'On Historic Preservation, use Submit an Application to determine whether the property follows the Historic District Commission or Newton Historical Commission track.'};
  if (t.includes('conservation') || t.includes('wetland') || t.includes('floodplain') || t.includes('stream')) return {sourceId:'newton-conservation', where:'On Wetlands Permitting Info, review the regulated-area thresholds and the examples/resources for properties near wetlands, streams, or floodplains.'};
  if (t.includes('inspection')) return {sourceId:'newton-inspections', where:'On Inspectional Services, use Online Permitting/inspection request information to determine how and when to request the required inspection.'};
  if (t.includes('energy') || t.includes('hers')) return {sourceId:'newton-planning', where:'Start with the City’s planning/building application resources, then follow the energy-code documentation requirements identified for your permit.'};
  return null;
}
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
    <div id="completionToast" class="completion-toast hidden" role="status" aria-live="polite"><button id="dismissCompletion" class="toast-close" type="button" aria-label="Dismiss">×</button><strong>Project sequence complete.</strong><span>You’ve checked every planning step. Keep following the City’s current instructions and approvals.</span></div>
    <div id="confetti" class="confetti" aria-hidden="true"></div>`;

  document.querySelectorAll('[data-step]').forEach(cb => cb.onchange = () => {
    const current = JSON.parse(localStorage.getItem(savedKey) || '{}');
    current.steps = current.steps || plan.steps;
    current.steps[Number(cb.dataset.step)].status = cb.checked ? 'complete' : 'not_started';
    current.updatedAt = new Date().toISOString();
    localStorage.setItem(savedKey, JSON.stringify(current));
    updateCompletion(plan);
  });

  $('dismissCompletion').onclick = () => $('completionToast')?.classList.add('hidden');
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
  const allNext = [...plan.confirm, ...plan.required];
  return `<section class="panel checklist-panel combined-workflow">
    <div class="section-heading"><div><div class="eyebrow">NEXT STEPS / CHECKLIST</div><h2>What to do next</h2><p class="muted">Resolve the first items below, then work through the project sequence. Guidance is open by default so each step explains what to do, where to go, and what to look for.</p></div><span class="check-count" id="checkCount">0 / ${plan.steps.length}</span></div>
    ${allNext.length ? '<div class="action-strip"><div class="eyebrow">FIRST THINGS TO RESOLVE</div><ol>' + allNext.slice(0,4).map((x,i) => {
      const g = guidanceForRequirement(x);
      const url = g ? sourceById(g.sourceId) : null;
      return '<li><span>0' + (i+1) + '</span><div><b>' + escape(x.title) + '</b><p>' + escape(x.action) + '</p>' +
        (g && url ? '<a class="guidance-button" href="' + escape(url) + '" target="_blank" rel="noreferrer">Open the relevant City page ↗</a>' : '') +
        '</div></li>';
    }).join('') + '</ol></div>' : ''}
    <ol class="steps">${plan.steps.map((s,i) => {
      const g = stepGuidance[s.id] || stepGuidance.scope;
      const url = sourceById(g.sourceId);
      return `<li class="step-item"><label class="stepcheck"><input data-step="${i}" type="checkbox" ${s.status === 'complete' ? 'checked' : ''}> <b>${i+1}. ${escape(s.title)}</b></label>
        <span class="step-depends">Depends on: ${s.dependsOn.length ? s.dependsOn.join(', ') : 'project scope'}</span>
        <div class="step-guidance"><div class="step-guidance-label">HOW TO COMPLETE THIS STEP</div><p>${escape(g.description)}</p><p class="step-where"><strong>Where to go:</strong> ${escape(g.where)}</p>${url ? '<a class="guidance-button" href="' + escape(url) + '" target="_blank" rel="noreferrer">Open official guidance ↗</a>' : ''}</div>
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
  for (let i=0;i<80;i++) {
    const piece = document.createElement('i');
    piece.style.setProperty('--x', (Math.random()*100) + '%');
    piece.style.setProperty('--y', (Math.random()*22) + '%');
    piece.style.setProperty('--delay', (Math.random()*.55) + 's');
    piece.style.setProperty('--rot', (Math.random()*360) + 'deg');
    piece.style.setProperty('--drift', ((Math.random()-.5)*220) + 'px');
    root.appendChild(piece);
  }
  setTimeout(() => { root.innerHTML=''; confettiRunning=false; }, 3000);
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
    const tailored = guidanceForRequirement(x);
    const url = tailored ? sourceById(tailored.sourceId) : null;
    return `<article class="result ${statusClass(x.status)}"><div class="result-main"><span class="badge">${x.status.replaceAll('_',' ')}</span><h3>${escape(x.title)}</h3><p>${escape(x.action)}</p><p class="small">${escape(x.explanation || '')}</p>
      ${tailored && url ? '<div class="result-guidance"><span>Where to start</span><p class="small">' + escape(tailored.where) + '</p><a class="guidance-button" href="' + escape(url) + '" target="_blank" rel="noreferrer">Open the relevant City page ↗</a></div>' : ''}
    </div></article>`;
  }).join('')}</section>`;
}

function escape(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
