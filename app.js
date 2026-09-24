import {PROJECTS, PROJECT_CATALOG, resolveProperty, buildPlan, getQuestions, sourcesFor, inferClarifiedAnswer} from './src/core.js';
import {
  createStorage,
  createEmptyProjectState,
  listSavedProjects,
  loadProject,
  saveProject,
  restoreProjectState,
  storageKeyForId,
  newProjectId
} from './src/project-state.js';

const $ = id => document.getElementById(id);
let property = null;
let type = null;
let answers = {};
let questionIndex = 0;
let editingFromReview = false;
let selectedCatalogId = null;
let clarifierState = {};
let clarificationMeta = {};
let clarifierQuestionMemory = {};
let activeProjectId = null;
let checklistWasComplete = false;
const storage = createStorage(typeof localStorage !== 'undefined' ? localStorage : null);
const STORAGE_AVAILABLE = storage.available;

// Applies a fresh (or restored) project state object to the module-level state.
// Every field is replaced, so nothing can survive from a previous project.
function applyProjectState(state) {
  activeProjectId = state.id;
  property = state.property;
  type = state.type;
  answers = state.answers;
  selectedCatalogId = state.selectedCatalogId;
  clarifierState = state.clarifierState;
  clarificationMeta = state.clarificationMeta;
  clarifierQuestionMemory = state.clarifierQuestionMemory;
  questionIndex = state.questionIndex;
  editingFromReview = state.editingFromReview;
  checklistWasComplete = false;
}

// Clears both the in-memory project state and the planner inputs that would
// otherwise still hold the previous project's values.
function startNewProjectState() {
  applyProjectState(createEmptyProjectState());
  const addressField = document.getElementById('address');
  if (addressField) addressField.value = '';
  document.getElementById('addressSuggestions')?.classList.add('hidden');
  addressField?.setAttribute('aria-expanded', 'false');
  const errorBox = document.getElementById('error');
  if (errorBox) { errorBox.textContent = ''; errorBox.classList.add('hidden'); }
  const select = document.getElementById('projectType');
  if (select) select.value = '';
  document.querySelectorAll('[data-picker-project], [data-picker-catalog]').forEach(x => x.classList.remove('selected'));
  document.getElementById('projectCatalog')?.classList.add('hidden');
  document.getElementById('result')?.classList.add('hidden');
  document.getElementById('questions')?.classList.add('hidden');
  document.querySelector('.planner-shell')?.classList.remove('hidden');
  document.body.classList.remove('focus-mode');
  updateProjectSummary();
}

const pageIds = ['home','about','how','mission','feedback','privacy','terms','plan'];
const pageIdSet = new Set(pageIds);
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
    $('about')?.classList.remove('page-active');
    $('mission')?.classList.remove('page-active');
    $('feedback')?.classList.remove('page-active');
    $('plan').classList.add('page-active');
    document.body.classList.remove('focus-mode');
    if (!$('questions')?.classList.contains('hidden') || !$('result')?.classList.contains('hidden')) {
      if (!property) {
        $('questions')?.classList.add('hidden');
        $('result')?.classList.add('hidden');
        document.querySelector('.planner-shell')?.classList.remove('hidden');
      }
    }
    window.scrollTo({top:0,behavior:'smooth'});
  } else {
    document.body.classList.remove('focus-mode');
    window.scrollTo({top:0,behavior:'smooth'});
  }
}

function routeFromHash() {
  const hash = location.hash.replace('#','') || 'home';
  navigate(pageIdSet.has(hash) ? hash : 'home');
}

document.querySelectorAll('[data-page-link]').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    const page = link.dataset.pageLink;
    if (!pageIdSet.has(page)) return;
    history.pushState(null,'','#' + page);
    navigate(page);
    closeMobileMenu();
  });
});
window.addEventListener('popstate', routeFromHash);
window.addEventListener('hashchange', routeFromHash);
routeFromHash();
function projectCatalogItem(id) {
  return [...(PROJECT_CATALOG.common || []).map(([id,label,flow]) => ({id,label,flow})), ...(PROJECT_CATALOG.categories || []).flatMap(c => c.items.map((label,i) => ({id:`${c.id}-${i}`,label,flow:'general_project',category:c.label})))]
    .find(x => x.id === id) || null;
}
function projectLabel(projectType, project = null) {
  return project?.projectCatalogLabel || project?.answers?.projectCatalogLabel || (projectType === 'general_project' && (project?.answers?.projectCatalogId || selectedCatalogId) ? projectCatalogItem(project?.answers?.projectCatalogId || selectedCatalogId)?.label : null) || PROJECTS[projectType]?.label || projectType;
}

function savedProjects() {
  return listSavedProjects(storage);
}

function renderSavedProjects() {
  const root = $('resume');
  if (!root) return;
  const projects = savedProjects();
  root.classList.remove('hidden');
  root.innerHTML = `
    <div class="resume-inner">
      <div class="resume-intro">
        <div class="eyebrow">PICK UP WHERE YOU LEFT OFF</div>
        <h2>${projects.length ? 'Your saved projects.' : 'Your project can stay with you.'}</h2>
        <p>${projects.length
          ? 'Projects are saved on this browser. Open one to continue exactly where you left off.'
          : 'No account is required. Start a project and it will be saved on this browser so you can return later.'}</p>
        <div class="resume-tools">
          <button type="button" class="secondary" id="importProject">Import project file</button>
          <input id="importProjectInput" type="file" accept=".json,application/json" class="file-input" aria-label="Import a saved project file">
          <span class="resume-storage-note">Browser-saved · automatically expires after 30 days of inactivity</span>
        </div>
      </div>
      ${projects.length ? `<div class="resume-list">${projects.slice(0,8).map((p,index) => {
        const completed = (p.steps || []).filter(s => s.status === 'complete').length;
        const total = (p.steps || []).length || 0;
        const key = projectSaveKeyFor(p);
        return '<div class="resume-card">' +
          '<span>' + escape(String(index + 1).padStart(2,'0')) + '</span>' +
          '<button type="button" class="resume-open" data-resume-key="' + escape(key) + '">' +
            '<b>' + escape(projectLabel(p.type, p)) + '</b>' +
            '<strong>' + escape(p.property.resolvedAddress) + '</strong>' +
            '<small>' + completed + ' / ' + total + ' steps complete · saved ' + formatSavedDate(p.updatedAt) + '</small>' +
          '<em class="resume-open-label">Open →</em>' +
          '</button>' +
          '<button type="button" class="resume-delete" data-delete-key="' + escape(key) + '" aria-label="Delete saved project" title="Delete saved project"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8v10M12 8v10M16 8v10M5 5h14M9 5l1-2h4l1 2M6 5l1 16h10l1-16"/></svg></button>' +
        '</div>';
      }).join('')}</div>` : '<div class="resume-empty"><strong>No projects saved yet.</strong><span>Your first generated plan will appear here.</span></div>'}
    </div>`;
  root.querySelectorAll('[data-resume-key]').forEach(btn => {
    btn.addEventListener('click', () => resumeSavedProject(btn.dataset.resumeKey));
  });
  root.querySelectorAll('[data-delete-key]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.deleteKey;
      const saved = JSON.parse(storage.get(key) || 'null');
      if (!saved) return;
      const name = projectLabel(saved.type, saved) + ' · ' + saved.property.resolvedAddress;
      if (!window.confirm('Delete this saved project?\\n\\n' + name)) return;
      storage.remove(key);
      if (projectSaveKey() === key) startNewProjectState();
      renderSavedProjects();

    });
  });
  $('importProject')?.addEventListener('click', () => $('importProjectInput')?.click());
  $('importProjectInput')?.addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      if (importSavedProject(imported)) {
        renderSavedProjects();
        resumeSavedProject(projectSaveKeyFor(imported));
      } else {
        window.alert('That file is not a valid Home Project Planner project.');
      }
    } catch {
      window.alert('The project file could not be read.');
    } finally {
      e.target.value = '';
    }
  });
}

const feedbackForm = $('feedbackForm');
if (feedbackForm) {
  const feedbackStatus = $('feedbackStatus');
  const feedbackSubmit = $('feedbackSubmit');
  const feedbackProgress = $('feedbackProgress');
  const feedbackFieldset = $('feedbackFields');
  const feedbackEmail = $('feedbackEmail');
  const feedbackMessage = $('feedbackMessage');
  const feedbackHoneypot = $('feedbackWebsite');
  let feedbackSubmitting = false;
  const feedbackChoiceInputs = [...feedbackForm.querySelectorAll('.feedback-choice-input')];

  function updateFeedbackProgress() {
    const completed = new Set(
      feedbackChoiceInputs.filter(input => input.checked).map(input => input.name)
    ).size;
    const total = 4;
    if (feedbackProgress) {
      feedbackProgress.style.setProperty('--feedback-progress', Math.round(completed / total * 100) + '%');
      feedbackProgress.querySelector('strong').textContent = completed + ' / ' + total;
      feedbackProgress.querySelector('span').textContent =
        completed === total ? 'Core questions complete' : 'Quick questions completed';
    }
    feedbackForm.classList.toggle('feedback-ready', completed === total);
  }

  function setFeedbackBusy(busy) {
    feedbackSubmitting = busy;
    feedbackFieldset.disabled = busy;
    feedbackSubmit.disabled = busy;
    feedbackSubmit.setAttribute('aria-busy', String(busy));
    feedbackSubmit.classList.toggle('is-submitting', busy);
    feedbackSubmit.querySelector('.feedback-submit-label').textContent =
      busy ? 'Sending feedback' : 'Submit feedback';
    feedbackSubmit.querySelector('.feedback-submit-icon').textContent = busy ? '…' : '→';
  }

  function clearFeedbackStatus() {
    feedbackStatus.textContent = '';
    feedbackStatus.className = 'feedback-status';
  }

  feedbackChoiceInputs.forEach(input => {
    input.addEventListener('change', () => {
      updateFeedbackProgress();
      clearFeedbackStatus();
    });
  });

  feedbackMessage?.addEventListener('input', () => {
    const count = $('feedbackCharacterCount');
    if (count) count.textContent = feedbackMessage.value.length + ' / 3000';
  });

  feedbackForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (feedbackSubmitting) return;

    clearFeedbackStatus();

    if (!feedbackForm.checkValidity()) {
      feedbackForm.reportValidity();
      return;
    }

    const payload = {
      role: feedbackForm.elements.role.value,
      project: feedbackForm.elements.project.value,
      usefulness: feedbackForm.elements.usefulness.value,
      newInformation: feedbackForm.elements.newInformation.value,
      feedback: feedbackForm.elements.feedback.value.trim(),
      contactEmail: feedbackEmail?.value.trim() || '',
      website: feedbackHoneypot?.value.trim() || ''
    };

    setFeedbackBusy(true);
    feedbackStatus.className = 'feedback-status submitting';
    feedbackStatus.textContent = 'Sending your feedback securely…';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      let result = null;
      try {
        result = await response.json();
      } catch {}

      if (!response.ok) {
        throw new Error(result?.error || 'Feedback could not be submitted.');
      }

      feedbackForm.reset();
      feedbackStatus.className = 'feedback-status success';
      feedbackStatus.innerHTML =
        '<strong>Feedback received.</strong><span>Your response was saved securely.</span>';
      feedbackForm.classList.remove('feedback-ready');
      const count = $('feedbackCharacterCount');
      if (count) count.textContent = '0 / 3000';
      updateFeedbackProgress();
    } catch (error) {
      feedbackStatus.className = 'feedback-status error';
      feedbackStatus.textContent = error?.name === 'AbortError'
        ? 'The server did not respond in time. Your answers are still here. Please try again.'
        : 'We could not save your feedback. Your answers are still here. Please try again.';
    } finally {
      clearTimeout(timeoutId);
      setFeedbackBusy(false);
      updateFeedbackProgress();
    }
  });

  updateFeedbackProgress();
}

function formatSavedDate(value) {
  if (!value) return 'recently';
  try { return new Date(value).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}); }
  catch { return 'recently'; }
}

function importSavedProject(project) {
  if (!STORAGE_AVAILABLE) return false;
  if (!project?.type || !project?.property?.resolvedAddress || !Array.isArray(project.steps)) return false;
  return Boolean(saveProject(storage, {
    ...project,
    id: project.id || null,
    steps: project.steps.map(s => ({...s, status: s.status === 'complete' ? 'complete' : 'not_started'}))
  }));
}

function projectSaveKeyFor(project) {
  if (project?.storageKey) return project.storageKey;
  if (project?.id) return storageKeyForId(project.id);
  return null;
}

function resumeSavedProject(key) {
  const saved = loadProject(storage, key);
  if (!saved) { renderSavedProjects(); return; }
  startNewProjectState();
  const state = restoreProjectState(saved);
  applyProjectState(state);
  if (!activeProjectId) activeProjectId = saved.id || null;
  let plan;
  try {
    plan = buildPlan(type, property, answers);
  } catch {
    // A damaged record must not leave half of it loaded or crash the page.
    startNewProjectState();
    renderSavedProjects();
    window.alert('This saved project could not be opened. Your other saved projects are unaffected.');
    return;
  }
  history.pushState(null,'','#plan');
  navigate('plan');
  renderResult(plan, {resume:true, saved});
}

renderSavedProjects();

const heroGraphic = document.querySelector('.hero-graphic');
const heroStart = $('heroStart');

if (heroGraphic && heroStart && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const lessonDot = document.createElement('span');
  lessonDot.className = 'lesson-dot';
  lessonDot.setAttribute('aria-hidden', 'true');
  document.body.appendChild(lessonDot);

  setTimeout(() => {
    const dot = heroGraphic.querySelector('.site-point');
    if (!dot) {
      lessonDot.remove();
      return;
    }

    const a = dot.getBoundingClientRect();
    const b = heroStart.getBoundingClientRect();
    const sx = a.left + a.width / 2;
    const sy = a.top + a.height / 2;
    const ex = b.left + b.width * .52;
    const ey = b.top + b.height * .52;
    const dx = ex - sx;
    const dy = ey - sy;

    lessonDot.style.left = sx + 'px';
    lessonDot.style.top = sy + 'px';

    if (typeof lessonDot.animate !== 'function') {
      lessonDot.style.opacity = '1';
      lessonDot.style.transform = 'translate(-50%,-50%) scale(1)';
      setTimeout(() => lessonDot.remove(), 900);
      return;
    }

    lessonDot.animate([
      { transform:'translate(-50%,-50%) translate(0,0) scale(.82)', opacity:0 },
      { transform:'translate(-50%,-50%) translate(0,-24px) scale(1)', opacity:1, offset:.12 },
      { transform:'translate(-50%,-50%) translate(' + (dx*.20) + 'px,' + (dy*.20-16) + 'px) scale(1)', opacity:1, offset:.34 },
      { transform:'translate(-50%,-50%) translate(' + (dx*.46) + 'px,' + (dy*.46-9) + 'px) scale(1)', opacity:1, offset:.56 },
      { transform:'translate(-50%,-50%) translate(' + (dx*.76) + 'px,' + (dy*.76-3) + 'px) scale(1)', opacity:1, offset:.79 },
      { transform:'translate(-50%,-50%) translate(' + dx + 'px,' + dy + 'px) scale(1)', opacity:1, offset:1 }
    ], {
      duration:2200,
      easing:'cubic-bezier(.22,.72,.18,1)',
      fill:'forwards'
    }).finished.then(async () => {
      // Hold the dot on the button long enough to read and physically tap it.
      heroStart.classList.add('guided-hover');
      await new Promise(resolve => setTimeout(resolve, 260));

      spawnButtonSparks(heroStart);
      spawnButtonEcho(heroStart);
      heroStart.classList.add('guided-click','hero-breathe');
      const fade = lessonDot.animate([
        { transform:'translate(-50%,-50%) scale(1)', opacity:1 },
        { transform:'translate(-50%,-50%) scale(.72)', opacity:.72, offset:.45 },
        { transform:'translate(-50%,-50%) scale(.18)', opacity:0, offset:1 }
      ], {
        duration:560,
        easing:'cubic-bezier(.25,.1,.25,1)',
        fill:'forwards'
      });

      await fade.finished;
      heroStart.classList.remove('guided-hover','guided-click');
      lessonDot.remove();
    }).catch(() => lessonDot.remove());
  }, 450);
}

function spawnButtonEcho(button) {
  const rect = button.getBoundingClientRect();
  const echo = document.createElement('span');
  echo.className = 'button-echo';
  echo.style.left = rect.left + 'px';
  echo.style.top = rect.top + 'px';
  echo.style.width = rect.width + 'px';
  echo.style.height = rect.height + 'px';
  document.body.appendChild(echo);
  setTimeout(() => echo.remove(), 850);
}

function spawnButtonSparks(button) {
  const rect = button.getBoundingClientRect();
  const cx = rect.left + rect.width * .52;
  const cy = rect.top + rect.height * .52;
  const count = 18;

  for (let i = 0; i < count; i++) {
    const spark = document.createElement('span');
    spark.className = 'dot-spark';
    const angle = (Math.PI * 2 * i / count) + (Math.random() - .5) * .22;
    const distance = 30 + Math.random() * 48;
    const size = 3 + Math.random() * 3.5;

    spark.style.left = cx + 'px';
    spark.style.top = cy + 'px';
    spark.style.width = size + 'px';
    spark.style.height = Math.max(3, size * .55) + 'px';
    spark.style.setProperty('--dx', Math.cos(angle) * distance + 'px');
    spark.style.setProperty('--dy', Math.sin(angle) * distance + 'px');
    spark.style.setProperty('--rot', (angle * 180 / Math.PI) + 'deg');
    spark.style.setProperty('--delay', (Math.random() * .08) + 's');
    document.body.appendChild(spark);
    setTimeout(() => spark.remove(), 1050);
  }
}

function openMobileMenu() {
  const menu = $('mobileMenu');
  if (!menu) return;
  menu.classList.add('open');
  menu.setAttribute('aria-hidden','false');
  menu.inert = false;
  $('menuToggle')?.setAttribute('aria-expanded','true');
  $('mobileMenuClose')?.focus();
}
function closeMobileMenu(returnFocus = true) {
  const menu = $('mobileMenu');
  if (!menu) return;
  menu.classList.remove('open');
  menu.setAttribute('aria-hidden','true');
  menu.inert = true;
  $('menuToggle')?.setAttribute('aria-expanded','false');
  if (returnFocus) $('menuToggle')?.focus();
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('mobileMenu')?.classList.contains('open')) closeMobileMenu();
});
closeMobileMenu();

function updateProjectSummary() {
  const root = $('projectSummary');
  const label = $('projectSummaryLabel');
  if (!root || !label) return;
  const item = selectedCatalogId ? projectCatalogItem(selectedCatalogId) : null;
  const selectedButton = document.querySelector('[data-picker-project].selected');
  const differentSelected = document.querySelector('[data-picker-catalog].selected');
  const text = item?.label || selectedButton?.querySelector('b')?.textContent?.trim() || (differentSelected ? 'Choose a project from the library' : '');
  label.textContent = text;
  root.classList.toggle('hidden', !text);
}

function resetProjectSelection() {
  answers = {};
  selectedCatalogId = null;
  if ($('projectType')) $('projectType').value = '';
  document.querySelectorAll('[data-picker-project], [data-picker-catalog]').forEach(x => x.classList.remove('selected'));
  $('projectCatalog')?.classList.add('hidden');
  updateProjectSummary();
}

function selectProject(projectType, catalogId = null) {
  answers = {};
  selectedCatalogId = catalogId || null;
  if ($('projectType')) $('projectType').value = projectType;
  if (catalogId) {
    const item = projectCatalogItem(catalogId);
    if (item) answers = {projectCatalogId:item.id, projectCatalogLabel:item.label};
  }
  document.querySelectorAll('[data-picker-project]').forEach(x => {
    x.classList.toggle('selected', Boolean(catalogId) && x.dataset.catalogId === catalogId);
  });
  document.querySelector('[data-picker-catalog]')?.classList.remove('selected');
  $('projectCatalog')?.classList.add('hidden');
  updateProjectSummary();
}

document.querySelectorAll('[data-project-start]').forEach(card => {
  card.addEventListener('click', () => {
    startNewProjectState();
    selectProject(card.dataset.projectStart, card.dataset.projectCatalog || null);
    history.pushState(null,'','#plan');
    navigate('plan');
    window.scrollTo({top:0,behavior:'smooth'});
    setTimeout(() => $('address')?.focus(), 250);
  });
});

// "Start planning" entry links begin a brand new project through the same
// fresh-project path as the "Start another project" button.
document.querySelectorAll('#home a[data-page-link="plan"]').forEach(link => {
  link.addEventListener('click', () => startNewProjectState());
});

$('menuToggle')?.addEventListener('click', openMobileMenu);
$('mobileMenuClose')?.addEventListener('click', closeMobileMenu);
$('mobileMenu')?.querySelectorAll('[data-page-link]').forEach(link => link.addEventListener('click', () => closeMobileMenu(false)));

function setCatalogSelection(id) {
  const item = projectCatalogItem(id);
  if (!item) return;
  selectedCatalogId = item.id;
  answers = {projectCatalogId:item.id, projectCatalogLabel:item.label};
  if ($('projectType')) {
    const option = [...$('projectType').options].find(o => o.dataset.catalogId === item.id);
    $('projectType').value = option?.value || item.flow || 'general_project';
  }
  document.querySelectorAll('[data-picker-project]').forEach(x => x.classList.remove('selected'));
  document.querySelector('[data-picker-catalog]')?.classList.add('selected');
  updateProjectSummary();
  renderProjectCatalog();
}
function renderProjectCatalog() {
  const root = $('projectCatalog');
  if (!root) return;
  const all = PROJECT_CATALOG.categories || [];
  const selected = selectedCatalogId ? projectCatalogItem(selectedCatalogId) : null;
  root.innerHTML =
    '<div class="catalog-heading"><div><div class="eyebrow">DIFFERENT PROJECT</div><h3>Find the work you are actually doing.</h3><p class="small">Choose from broader categories, then pick the closest description.</p>' +
    (selected ? '<div class="catalog-selected">Selected: <b>' + escape(selected.label) + '</b></div>' : '') +
    '</div><input id="catalogSearch" type="search" placeholder="Search projects…" aria-label="Search projects"></div><div class="catalog-grid">' +
    all.map(c => '<section class="catalog-category"><div class="catalog-category-header"><b>' + escape(c.label) + '</b><span>' + c.items.length + ' options</span></div><div>' +
      c.items.map((label,i) => '<button type="button" class="catalog-item ' + (selectedCatalogId === c.id + '-' + i ? 'selected' : '') + '" data-catalog-id="' + escape(c.id + '-' + i) + '">' + escape(label) + '<span>→</span></button>').join('') +
    '</div></section>').join('') + '</div>';
  root.querySelectorAll('.catalog-item').forEach(btn => btn.onclick = () => setCatalogSelection(btn.dataset.catalogId));
  $('catalogSearch').oninput = e => {
    const query = e.target.value.trim().toLowerCase();
    root.querySelectorAll('.catalog-category').forEach(cat => {
      let visible = 0;
      cat.querySelectorAll('.catalog-item').forEach(btn => {
        const show = !query || btn.textContent.toLowerCase().includes(query);
        btn.classList.toggle('hidden', !show);
        if (show) visible++;
      });
      cat.classList.toggle('hidden', visible === 0);
      if (query && visible) cat.classList.remove('hidden');
    });
  };
}
document.querySelectorAll('[data-picker-project]').forEach(btn => {
  btn.addEventListener('click', () => selectProject(btn.dataset.pickerProject, btn.dataset.catalogId || null));
});

document.querySelector('[data-picker-catalog]')?.addEventListener('click', () => {
  resetProjectSelection();
  if ($('projectType')) $('projectType').value = '__catalog';
  const different = document.querySelector('[data-picker-catalog]');
  different?.classList.add('selected');
  renderProjectCatalog();
  $('projectCatalog')?.classList.remove('hidden');
  updateProjectSummary();
  $('projectCatalog')?.scrollIntoView({behavior:'smooth',block:'nearest'});
});

const projectSelect = $('projectType');
projectSelect?.addEventListener('change', () => {
  if (projectSelect.value === '__catalog') {
    resetProjectSelection();
    projectSelect.value = '__catalog';
    const different = document.querySelector('[data-picker-catalog]');
    different?.classList.add('selected');
    renderProjectCatalog();
    $('projectCatalog')?.classList.remove('hidden');
    updateProjectSummary();
    return;
  }
  if (!projectSelect.value) return;
  const option = projectSelect.selectedOptions[0];
  selectProject(projectSelect.value, option?.dataset.catalogId || null);
});

(function tagCommonProjectOptions(){
  const ids = ['basement_finish','bathroom_renovation','kitchen_renovation','deck','addition','garage','adu','exterior','roofing','site'];
  ids.forEach(id => {
    const item = projectCatalogItem(id);
    if (!item) return;
    const option = [...(projectSelect?.options || [])].find(o => o.textContent.trim() === item.label);
    if (option) option.dataset.catalogId = item.id;
  });
})();

if (addressInput) {
  addressInput.addEventListener('input', () => {
    const value = addressInput.value.trim().slice(0, 200);
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
    if (e.key === 'Escape') { suggestions.classList.add('hidden'); addressInput.setAttribute('aria-expanded','false'); }
    if (e.key === 'Enter' && suggestions.querySelector('[role="option"]')) {
      e.preventDefault();
      suggestions.querySelector('[role="option"]').click();
    }
  });
}

document.addEventListener('click', e => {
  if (!e.target.closest('.address-wrap')) { suggestions?.classList.add('hidden'); addressInput?.setAttribute('aria-expanded','false'); }
});

async function searchAddresses(value) {
  const boundedValue = String(value || '').trim().slice(0, 200);
  if (!boundedValue) return [];
  const u = new URL('https://gisweb.newtonma.gov/server/rest/services/Data/MapServer/12/query');
  u.searchParams.set('where', `UPPER(Address) LIKE UPPER('${boundedValue.replace(/'/g, "''")}%')`);
  u.searchParams.set('outFields', 'Address,AddressID,Number,NumberSuffix,FullStName,City,ZipCode');
  u.searchParams.set('orderByFields', 'Address ASC');
  u.searchParams.set('resultRecordCount', '8');
  u.searchParams.set('returnGeometry', 'false');
  u.searchParams.set('f', 'json');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  let res;
  try {
    res = await fetch(u, {signal: controller.signal});
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Address search timed out. Please try again.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
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
  addressInput?.setAttribute('aria-expanded','true');
  suggestions.querySelectorAll('.suggestion').forEach(btn => {
    btn.onclick = () => {
      addressInput.value = btn.dataset.address;
       addressInput.setAttribute('aria-expanded','false');
      suggestions.classList.add('hidden');
      $('resolve').focus();
    };
  });
}

$('resolve').onclick = async () => {
  const error = $('error');
  const address = addressInput?.value.trim() || '';
  const chosenType = projectSelect?.value || '';
  error?.classList.add('hidden');

  if (address.length > 200) {
    error.textContent = 'Please keep the property address under 200 characters.';
    error.classList.remove('hidden');
    addressInput?.focus();
    return;
  }
  if (!address) {
    error.textContent = 'Please enter your Newton property address before continuing.';
    error.classList.remove('hidden');
    addressInput?.focus();
    return;
  }
  if (!chosenType || chosenType === '__catalog') {
    error.textContent = 'Please choose the type of project you are planning before continuing.';
    error.classList.remove('hidden');
    document.querySelector('.project-picker-label')?.scrollIntoView({behavior:'smooth',block:'center'});
    return;
  }

  $('resolve').disabled = true;
  $('resolve').textContent = 'Checking property…';
  $('resolve').setAttribute('aria-busy','true');
  try {
    const resolved = await resolveProperty(address);
    const catalogId = selectedCatalogId;
    const state = createEmptyProjectState();
    state.property = resolved;
    state.type = chosenType;
    state.selectedCatalogId = catalogId || null;
    state.answers = catalogId
      ? {projectCatalogId:catalogId, projectCatalogLabel:projectCatalogItem(catalogId)?.label || null}
      : {};
    // Keep the id created when this project was started; never derive it from inputs.
    state.id = activeProjectId || newProjectId();
    applyProjectState(state);
    history.pushState(null,'','#plan');
    renderQuestions();
  } catch (e) {
    error.textContent = e.message;
    error.classList.remove('hidden');
  } finally {
    $('resolve').removeAttribute('aria-busy');
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
  q.innerHTML = propertyHeader() + '<div id="questionCard"></div>' + propertyEvidenceBlock(property);
  renderQuestionCard();
  window.scrollTo({top:0,behavior:'smooth'});
}

function propertyHeader() {
  return `<div class="eyebrow">PROPERTY FOUND</div>
    <h2>${escape(property.resolvedAddress)}</h2>
    <div class="notice"><b>We ask only what can change the plan.</b> If you do not know an answer, choose “I'm not sure.” We will ask clarifying questions instead of making you guess.</div>`;
}

function visiblePropertyEvidence(property) {
  return (property.evidence || []).filter(item => {
    const value = item?.value;
    return value !== null && value !== undefined && value !== '' &&
      !/^none returned/i.test(String(value)) &&
      !/^not returned/i.test(String(value)) &&
      !/^not resolved/i.test(String(value)) &&
      !/^no mapped signal/i.test(String(value));
  });
}

function propertyFactsMarkup(property) {
  const visible = visiblePropertyEvidence(property);
  if (!visible.length) return '';
  return '<div class="facts compact-facts">' + visible.map(x =>
    '<span><b>' + escape(x.label) + '</b><strong>' + escape(String(x.value)) + '</strong></span>'
  ).join('') + '</div>';
}

function propertyEvidenceBlock(property) {
  if (!visiblePropertyEvidence(property).length) return '';
  return '<section class="property-evidence-below">' +
    '<div class="section-heading"><div><div class="eyebrow">PROPERTY</div><h2>Property facts</h2></div><span class="small">Official Newton GIS context</span></div>' +
    propertyFactsMarkup(property) +
  '</section>';
}

function inlineClarifierFor(parent, q) {
  const direct = (q.showWhen || []).some(([key,value]) => key === parent.id && value === 'unsure');
  const any = (q.showWhenAny || []).some(([key,value]) => key === parent.id && value === 'unsure');
  return direct || any;
}
function questionWhy(q) {
  if (q.why) return q.why;
  const t = String(q.text || '').toLowerCase();
  if (t.includes('electrical')) return 'Electrical scope can create a separate permit and inspection path.';
  if (t.includes('plumbing') || t.includes('bathroom')) return 'This can change the plumbing, building, or inspection path.';
  if (t.includes('gas')) return 'Gas scope can create a separate permit and inspection path.';
  if (t.includes('structur')) return 'Structural work can change the building-plan, engineering, and inspection requirements.';
  if (t.includes('window') || t.includes('door') || t.includes('exterior')) return 'Exterior changes can trigger additional zoning, historic, tree, or site review.';
  if (t.includes('tree') || t.includes('grading') || t.includes('excavat') || t.includes('site')) return 'Site work can trigger property-specific review.';
  if (q.kind === 'number') return 'This helps determine which thresholds, dimensions, or review steps may apply.';
  return 'This answer can change which requirements and follow-up questions apply to the project.';
}
function clarifierFor(q) {
  const specific = {
    structuralChanges: {
      text:'Which structural parts will actually change?',
      kind:'multi',
      options:[['walls','Walls or partitions'],['framing','Framing, beams, columns, or joists'],['foundation','Foundation or below-grade structure'],['none','None of these']]
    },
    electricalWork: {
      text:'Which electrical work is part of the project?',
      kind:'multi',
      options:[['circuits','Wiring or circuits'],['service','Electrical service or panel'],['fixtures','Fixtures, outlets, or lighting'],['equipment','Electrical equipment'],['none','None of these']]
    },
    plumbingWork: {
      text:'Which plumbing work is part of the project?',
      kind:'multi',
      options:[['fixtures','Fixtures or appliances'],['pipes','Supply, drain, or vent lines'],['layout','Moving plumbing locations'],['equipment','Plumbing equipment'],['none','None of these']]
    },
    gasWork: {
      text:'Which gas work is part of the project?',
      kind:'multi',
      options:[['equipment','Gas equipment or appliance'],['piping','Gas piping'],['new','New gas service or equipment'],['none','None of these']]
    },
    exteriorChange: {
      text:'Which exterior work is part of the project?',
      kind:'multi',
      options:[['openings','Windows, doors, or another opening'],['structure','Deck, porch, addition, or structure'],['envelope','Roof, siding, or exterior finish'],['site','Ground, trees, drainage, or paving'],['none','None of these']]
    },
    siteWork: {
      text:'Which site work is part of the project?',
      kind:'multi',
      options:[['grading','Grading or excavation'],['drainage','Drainage or stormwater'],['trees','Trees or landscaping'],['paving','Driveway, parking, or paving'],['none','None of these']]
    },
    treeImpact: {
      text:'Which tree-related condition is part of the project?',
      kind:'multi',
      options:[['nearby','Construction near trees'],['removal','Tree removal'],['protection','Tree protection or root-area work'],['planting','Tree planting as part of construction'],['none','None of these']]
    },
    windowsOrDoors: {
      text:'Which exterior opening work is part of the project?',
      kind:'multi',
      options:[['window','Windows'],['door','Exterior doors'],['both','Both windows and doors'],['none','None of these']]
    },
    newVentilation: {
      text:'Which ventilation work is part of the project?',
      kind:'multi',
      options:[['bath','Bathroom exhaust'],['whole','Whole-home or room ventilation'],['ducts','New or altered ductwork'],['equipment','Ventilation equipment'],['none','None of these']]
    },
    layoutChange: {
      text:'Which bathroom layout change is part of the project?',
      kind:'multi',
      options:[['walls','Removing or adding walls'],['fixtures','Moving fixtures'],['room','Changing the room layout'],['none','None of these']]
    },
    stairsOrGuard: {
      text:'Which deck safety elements are part of the project?',
      kind:'multi',
      options:[['stairs','New stairs'],['guards','Guards or railings'],['both','Both stairs and guards'],['none','None of these']]
    },
    footprintChange: {
      text:'Which footprint change is part of the project?',
      kind:'multi',
      options:[['increase','Increasing the footprint'],['decrease','Decreasing the footprint'],['reconfigure','Otherwise changing the footprint'],['none','None of these']]
    },
    demolition: {
      text:'What might be removed?',
      kind:'multi',
      options:[['interior','Interior walls or finishes'],['exterior','Exterior elements'],['structure','Structural parts'],['none','None of these']]
    },
    deckNew: {
      text:'Which describes the deck work?',
      kind:'choice',
      options:[['new_deck','A new deck'],['replacement','Replacing an existing deck']]
    },
    guttingExtent: {
      text:'How much of the existing dwelling will be gutted?',
      kind:'choice',
      options:[['more_than_half','More than half'],['not_more_than_half','Half or less']]
    },
    condo: {
      text:'Which best describes the ownership?',
      kind:'choice',
      options:[['shared','Condominium or other shared ownership'],['not_shared','Not shared ownership']]
    },
    condoApproval: {
      text:'Does the association require project approval?',
      kind:'choice',
      options:[['yes','Yes'],['no','No']]
    }
  };
  const entry = specific[q.id] || {
    text:'Which part of this work is involved?',
    kind:'choice',
    options:[['yes','Yes, this work is part of the project'],['no','No, this work is not part of the project']]
  };
  return {
    id:'__clarifier_' + q.id,
    text:entry.text,
    kind:entry.kind,
    options:entry.options,
    why:'This narrows the uncertainty without requiring technical terminology.'
  };
}

function applyClarificationInference(q, value) {
  if (!q?.parentId) return false;
  const inferred = inferClarifiedAnswer(q.parentId, value);
  if (!inferred) return false;
  answers[q.parentId] = inferred;
  clarificationMeta[q.id] = {
    parentId:q.parentId,
    inferredAnswer:inferred,
    value,
    questionId:q.id
  };
  return true;
}
function questionCluster(all, index) {
  const root = all[index];
  const cluster = [root];
  const rememberedMeta = Object.values(clarificationMeta).find(meta => meta.parentId === root.id);
  if (rememberedMeta) {
    const source = PROJECTS[type]?.questions?.find(q => q.id === (rememberedMeta.questionId || clarifierQuestionMemory[root.id]));
    const remembered = source ? {...source} : clarifierFor(root);
    remembered.parentId = root.id;
    clarifierQuestionMemory[root.id] = remembered.id;
    cluster.push(remembered);
    return cluster;
  }

  let parent = root;
  for (let j=index+1; j<all.length; j++) {
    const candidate = all[j];
    if (!inlineClarifierFor(parent, candidate)) break;
    clarifierQuestionMemory[root.id] = candidate.id;
    cluster.push({...candidate, parentId:parent.id});
    parent = candidate;
  }

  // A top-level "I'm not sure" gets one inline clarification when the data
  // does not already define a direct follow-up. Never create a second layer.
  if (cluster.length === 1 && root.kind === 'choice' && answers[root.id] === 'unsure') {
    const synthetic = clarifierFor(root);
    synthetic.parentId = root.id;
    clarifierQuestionMemory[root.id] = synthetic.id;
    cluster.push(synthetic);
  }
  return cluster;
}
function clarificationSelectionLabel(q, value) {
  const values = Array.isArray(value) ? value : [value];
  return values.map(v => q.options?.find(([optionValue]) => optionValue === v)?.[1] || v).join(', ');
}
function renderQuestionCard({animate=false} = {}) {
  const all = getQuestions(type, answers);
  const card = $('questionCard');
  if (questionIndex >= all.length) { renderReview(all); return; }
  const cluster = questionCluster(all, questionIndex);
  const progress = Math.round((questionIndex / all.length) * 100);
  const controls = cluster.map((q,i) => {
    const current = (q.parentId || q.id.startsWith('__clarifier_')) ? clarifierState[q.id] : answers[q.id];
    const inference = i === 0 ? Object.values(clarificationMeta).find(meta => meta.parentId === q.id) : null;
    const meta = q.parentId ? clarificationMeta[q.id] : null;
    const inferenceNotice = i > 0 && meta
      ? '<div class="clarifier-inference" role="note"><span class="clarifier-inference-icon" aria-hidden="true">✓</span><div><strong>We recorded ' + escape(meta.inferredAnswer === 'yes' ? 'Yes' : 'No') + '.</strong> You chose “' + escape(clarificationSelectionLabel(q, meta.value)) + '”, so we used that to resolve the original answer.</div><button type="button" class="clarifier-change" data-change-clarifier="' + escape(q.id) + '">Change answer</button></div>'
      : '';
    return '<div class="inline-question ' + (i ? 'clarifier-question ' : '') + (meta ? 'clarifier-inferred' : '') + '">' +
      (i ? '<div class="clarifier-connector" aria-hidden="true"></div>' : '') +
      '<div class="eyebrow">' + (i ? 'CLARIFYING QUESTION' : 'PROJECT SCOPE') + '</div>' +
      '<h1>' + escape(q.text) + '</h1>' +
      inferenceNotice +
      (q.kind === 'choice' || q.kind === 'multi' ? choiceControl(q,current,q.id,inference?.inferredAnswer || null,Boolean(meta)) : q.kind === 'text' ? textControl(q,current,q.id) : numberControl(q,current,q.id)) +
      '<p class="question-why"><b>Why we ask:</b> ' + escape(questionWhy(q)) + '</p>' +
      '</div>';
  }).join('');

  const clusterComplete = cluster.every(q => {
    const current = (q.parentId || q.id.startsWith('__clarifier_')) ? clarifierState[q.id] : answers[q.id];
    return questionValueComplete(q, current);
  });
  const reachesEnd = questionIndex + cluster.length >= all.length;
  const actionLabel = reachesEnd && clusterComplete ? 'Review my answers' : 'Continue';

  card.innerHTML = '<div class="question-progress"><span>Question ' + (questionIndex+1) + ' of ' + all.length + '</span><span>' + progress + '%</span></div><div class="progress"><div style="width:' + progress + '%"></div></div><div class="question-card' + (animate ? ' question-transition' : '') + '"><div class="question-stack">' + controls + '</div><div id="questionHint" class="small hint"></div><div class="question-actions"><button type="button" id="backQuestion" class="secondary" ' + (questionIndex===0?'disabled':'') + '>Back</button>' +
    (editingFromReview ? '<button type="button" id="returnToReview" class="secondary">Return to review</button>' : '') +
    (cluster[cluster.length-1]?.optional ? '<button type="button" id="skipQuestion" class="secondary">' + escape(cluster[cluster.length-1].skipLabel || 'Skip') + '</button>' : '') +
    '<button type="button" id="nextQuestion">' + actionLabel + '</button></div></div>';

  card.querySelectorAll('[data-change-clarifier]').forEach(btn => {
    btn.onclick = () => {
      const clarifierId = btn.dataset.changeClarifier;
      const meta = clarificationMeta[clarifierId];
      if (!meta) return;
      answers[meta.parentId] = 'unsure';
      delete clarificationMeta[clarifierId];
      renderQuestionCard({animate:false});
    };
  });

  card.querySelectorAll('.inline-question input').forEach(input => {
    input.addEventListener('change', () => {
      const q = cluster.find(x => x.id === input.dataset.questionId);
      if (!q) return;

      if (q.kind === 'multi') {
        const values = [...card.querySelectorAll('input[name="' + input.name + '"]:checked')].map(x => x.value);
        let normalized = values;
        if (normalized.includes('none') && normalized.length > 1) {
          normalized = input.value === 'none' && input.checked
            ? ['none']
            : normalized.filter(v => v !== 'none');
          card.querySelectorAll('input[name="' + input.name + '"]').forEach(x => {
            x.checked = normalized.includes(x.value);
          });
        }
        clarifierState[q.id] = normalized;
        const inferred = q.parentId ? applyClarificationInference(q, normalized) : false;
        card.querySelectorAll('input[name="' + input.name + '"]').forEach(x => x.closest('.choice')?.classList.toggle('selected', x.checked));
        if (inferred) renderQuestionCard({animate:false});
        return;
      }

      if (q.parentId) {
        clarifierState[q.id] = input.value;
        const inferred = applyClarificationInference(q,input.value);
        if (inferred) renderQuestionCard({animate:false});
        else {
          input.closest('.choice-list')?.querySelectorAll('.choice').forEach(el => el.classList.remove('selected'));
          input.closest('.choice')?.classList.add('selected');
        }
        return;
      }

      const wasUnsure = answers[q.id] === 'unsure';
      answers[q.id] = input.value;
      Object.keys(clarifierState).filter(k => k.startsWith('__clarifier_' + q.id)).forEach(k => delete clarifierState[k]);
      Object.keys(clarificationMeta).filter(k => clarificationMeta[k].parentId === q.id).forEach(k => delete clarificationMeta[k]);
      input.closest('.choice-list')?.querySelectorAll('.choice').forEach(el => el.classList.remove('selected'));
      input.closest('.choice')?.classList.add('selected');

      if (input.value === 'unsure' || wasUnsure) {
        renderQuestionCard({animate:false});
      }
    });
  });

  card.querySelectorAll('.number-wrap input, .text-wrap textarea').forEach(input => {
    input.addEventListener('input', () => {
      // Keep typed values live in the DOM; Continue/Skip persists them.
    });
  });

  $('backQuestion').onclick = () => {
    if (questionIndex > 0) { questionIndex--; renderQuestionCard(); }
  };

  $('returnToReview')?.addEventListener('click', () => {
    saveClusterValues(cluster);
    editingFromReview=false;
    questionIndex=0;
    renderReview(getQuestions(type,answers));
  });

  $('skipQuestion')?.addEventListener('click', () => {
    const last=cluster[cluster.length-1];
    answers[last.id]=null;
    cleanupHiddenAnswers();
    questionIndex += cluster.length;
    renderQuestionCard();
  });

  $('nextQuestion').onclick = () => {
    if (!saveClusterValues(cluster)) {
      $('questionHint').textContent=`Complete the questions shown above, or use “I'm not sure” to open a clarification.`;
      $('questionHint').classList.add('validation');
      return;
    }

    const rootId = cluster[0].id;
    const updated = getQuestions(type, answers);
    const rootIndex = updated.findIndex(q => q.id === rootId);
    const inlineConsumed = cluster.slice(1).filter(q => updated.some(x => x.id === q.id)).length;
    questionIndex = rootIndex >= 0 ? rootIndex + 1 + inlineConsumed : questionIndex + 1;
    renderQuestionCard({animate:true});
  };
}
function cleanupHiddenAnswers() {
  const visibleIds = new Set(getQuestions(type, answers).map(x=>x.id));
  const metadataIds = new Set(['projectCatalogId','projectCatalogLabel']);
  for (const key of Object.keys(answers)) {
    if (!visibleIds.has(key) && !metadataIds.has(key)) delete answers[key];
  }
}

function questionValueComplete(q, value) {
  if (q.kind === 'multi') return Array.isArray(value) && value.length > 0;
  return value !== undefined;
}

function saveClusterValues(cluster) {
  for (const q of cluster) {
    const value = readQuestionValue(q);
    if (!questionValueComplete(q, value)) return false;
    if (q.parentId || q.id.startsWith('__clarifier_')) {
      clarifierState[q.id] = value;
      applyClarificationInference(q, value);
    } else {
      answers[q.id] = value;
    }
  }
  cleanupHiddenAnswers();
  return true;
}

function choiceControl(q,current,name,inferredAnswer = null,lockInferred = false) {
  const values = q.kind === 'multi' ? (Array.isArray(current) ? current : []) : [current];
  const inputType = q.kind === 'multi' ? 'checkbox' : 'radio';
  const groupName = q.kind === 'multi' ? 'questionMulti-' + name : 'questionChoice-' + name;
  return '<div class="choice-list ' + (q.kind === 'multi' ? 'multi-choice-list' : '') + '">' +
    q.options.map(([value,label]) => {
      const selected = values.includes(value);
      const inferred = inferredAnswer && selected;
      return '<label class="choice ' + (selected ? 'selected ' : '') + (inferred ? 'inferred-choice' : '') + '"><input data-question-id="' + escape(name) + '" type="' + inputType + '" name="' + escape(groupName) + '" value="' + escape(value) + '" ' + (selected ? 'checked ' : '') + (lockInferred ? 'disabled ' : '') + '><span>' + escape(label) + '</span>' + (inferred ? '<small class="inferred-badge">Inferred</small>' : '') + '</label>';
    }).join('') +
    '</div>';
}
function numberControl(q,current,id) {
  return '<div class="number-wrap"><input id="questionNumber-' + escape(id) + '" type="number" min="' + (q.min ?? 0) + '" ' + (q.max != null ? 'max="' + q.max + '"' : '') + ' step="any" value="' + (current ?? '') + '" placeholder="Enter an estimate"><span>' + escape(q.unit || '') + '</span></div>';
}
function textControl(q,current,id) {
  return '<div class="text-wrap"><textarea id="questionText-' + escape(id) + '" rows="4" maxlength="500" placeholder="Describe it briefly">' + escape(current ?? '') + '</textarea></div>';
}
function readQuestionValue(q) {
  if (q.kind === 'choice') return document.querySelector('input[name="questionChoice-' + q.id + '"]:checked')?.value;
  if (q.kind === 'multi') return [...document.querySelectorAll('input[name="questionMulti-' + q.id + '"]:checked')].map(input => input.value);
  if (q.kind === 'text') { const value = document.querySelector('#questionText-' + q.id)?.value.trim(); return value || undefined; }
  const raw = document.querySelector('#questionNumber-' + q.id)?.value.trim();
  if (raw === '') return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < (q.min ?? 0) || (q.max != null && value > q.max)) return undefined;
  return value;
}
function renderReview(all) {
  const card = $('questionCard');
  const unanswered = all.filter(q => answers[q.id] === undefined && !q.optional);
  if (unanswered.length) {
    questionIndex = all.indexOf(unanswered[0]);
    renderQuestionCard();
    return;
  }
  const unsure = all.filter(q => answers[q.id] === 'unsure');
  card.innerHTML = '<div class="eyebrow">READY TO PLAN</div>' +
    '<h1>Review your project</h1>' +
    '<p class="muted">Everything below is editable. Select <b>Edit</b> beside any answer to jump directly to that question.</p>' +
    '<div class="review-list review-edit-list">' +
      all.map((q,i) => {
        const needsClarification = answers[q.id] === 'unsure';
        return '<div class="' + (needsClarification ? 'review-needs-clarification' : '') + '">' +
          '<span>' + escape(q.text) + '</span>' +
          '<b>' + escape(formatAnswer(q, answers[q.id])) + '</b>' +
          (needsClarification ? '<em class="review-flag" title="Needs clarification" aria-label="Needs clarification">!</em>' : '') +
          '<button type="button" class="review-edit" data-edit-question="' + i + '">Edit</button>' +
        '</div>';
      }).join('') +
    '</div>' +
    (unsure.length ? '<div class="notice review-clarification-notice"><b>' + unsure.length + ' answer' + (unsure.length === 1 ? '' : 's') + ' still need clarification.</b> Answers marked with <strong>!</strong> are the ones that remain uncertain.</div>' : '') +
    '<div class="question-actions"><button type="button" id="backQuestion" class="secondary">Back</button><button type="button" id="generatePlan">Generate project plan</button></div>';

  document.querySelectorAll('[data-edit-question]').forEach(btn => btn.onclick = () => {
    questionIndex = Number(btn.dataset.editQuestion);
    editingFromReview = true;
    renderQuestionCard();
    window.scrollTo({top:0,behavior:'smooth'});
  });
  $('backQuestion').onclick = () => { questionIndex = Math.max(0, all.length - 1); renderQuestionCard(); };
  $('generatePlan').onclick = () => {
    editingFromReview = false;
    renderResult(buildPlan(type, property, answers));
  };
}
function formatAnswer(q, value) {
  if (value === 'yes') return 'Yes';
  if (value === 'no') return 'No';
  if (value === 'unsure') return "I'm not sure";
  if (value === null) return q.optional ? 'Skipped' : 'Not provided';
  if (value == null) return 'Not provided';
  return q.unit ? `${value} ${q.unit}` : String(value);
}

function projectSaveKey() {
  return activeProjectId ? storageKeyForId(activeProjectId) : null;
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
  'newton-newgov':'https://newtonma.viewpointcloud.com/',
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
  if (t.includes('fire')) return {sourceId:'newton-fire', where:'On the Fire Department Plan Reviews page, use the Residential Plan Review (1–6 dwelling units) section and the NewGov submission link. Residential building permit applications are reviewed by Newton Fire.'};  if (t.includes('zoning') || t.includes('setback') || t.includes('far') || t.includes('lot coverage')) return {sourceId:'newton-zoning', where:'On Planning & Development, use the zoning resources and the Zoning review application. The City’s interactive zoning map is also linked from its map resources.'};
  if (t.includes('tree')) return {sourceId:'newton-tree', where:'On the Tree Preservation Ordinance page, look for Tree Permit Application – Construction and the Tree Save Area requirements. Exterior construction can require a Tree Permit even when no tree is being removed.'};
  if (t.includes('historic')) return {sourceId:'newton-historic', where:'On Historic Preservation, use Submit an Application to determine whether the property follows the Historic District Commission or Newton Historical Commission track.'};
  if (t.includes('conservation') || t.includes('wetland') || t.includes('floodplain') || t.includes('stream')) return {sourceId:'newton-conservation', where:'On Wetlands Permitting Info, review the regulated-area thresholds and the examples/resources for properties near wetlands, streams, or floodplains.'};
  if (t.includes('inspection')) return {sourceId:'newton-inspections', where:'On Inspectional Services, use Online Permitting/inspection request information to determine how and when to request the required inspection.'};
  if (t.includes('energy') || t.includes('hers')) return {sourceId:'newton-planning', where:'Start with the City’s planning/building application resources, then follow the energy-code documentation requirements identified for your permit.'};
  return null;
}
function renderResult(plan, options = {}) {
  $('questions').classList.add('hidden');
  document.body.classList.add('focus-mode');
  const r = $('result');
  r.classList.remove('hidden');
  const existingKey = projectSaveKey();
  const saved = options.resume ? (options.saved || (existingKey ? loadProject(storage, existingKey) : null)) : null;
  plan.steps = plan.steps.map((x,i) => ({
    ...x,
    status: options.resume && saved?.steps?.[i]?.status === 'complete' ? 'complete' : 'not_started'
  }));
  checklistWasComplete = options.resume && plan.steps.length > 0 && plan.steps.every(x => x.status === 'complete');
  const record = saveProject(storage, {
    id: activeProjectId || saved?.id || null,
    type,
    property,
    answers,
    selectedCatalogId,
    clarifierState,
    clarificationMeta,
    clarifierQuestionMemory,
    steps: plan.steps,
    projectCatalogLabel: plan.project.projectCatalogLabel || null,
    planGenerated: true
  });
  if (record?.id) activeProjectId = record.id;
  const savedKey = record?.storageKey || existingKey;
  renderSavedProjects();

  const statusClass = s => s === 'required' ? 'required' : s === 'potentially_required' ? 'conditional' : 'confirm';

  r.innerHTML = `
    <section class="plan-hero">
      <div><div class="eyebrow">PROJECT PLAN</div><h1>${escape(plan.project.projectCatalogLabel || PROJECTS[type].label)}</h1><p>${escape(property.resolvedAddress)} · ${escape(property.zoningDistrict || 'Zoning not resolved')}</p>${plan.project.projectDescription ? '<p class="plan-note">Project note: ' + escape(plan.project.projectDescription) + '</p>' : ''}</div>
      <div class="plan-hero-index">01<br><span>PLANNING CONTROL</span></div>
    </section>

    <section class="plan-choice panel">
      <div class="section-heading">
        <div><div class="eyebrow">YOUR NEXT VIEW</div><h2>Choose where to go next.</h2><p class="muted">You can switch between these views at any time. Your project stays saved while you work.</p></div>
      </div>
      <div class="plan-choice-grid">
        <button type="button" class="plan-choice-card" id="openChecklist">
          <span class="choice-number">01</span>
          <strong>Open the checklist</strong>
          <p>Work through the project steps one by one and mark them complete as you go.</p>
          <span class="choice-arrow">Open checklist →</span>
        </button>
        <button type="button" class="plan-choice-card" id="openWorkflow">
          <span class="choice-number">02</span>
          <strong>View the project workflow</strong>
          <p>See what appears to apply, what is conditional, what still needs confirmation, and what information to prepare.</p>
          <span class="choice-arrow">View workflow →</span>
        </button>
      </div>
    </section>

    <div id="checklistView" class="plan-view hidden">
      ${checklistSection(plan)}
      <div class="view-switch-bottom"><span>Need the bigger picture?</span><button type="button" class="secondary" id="toWorkflow">View project workflow →</button></div>
    </div>

    <div id="workflowView" class="plan-view hidden">
      ${sectionFor('What appears to apply', plan.required, statusClass)}
      ${sectionFor('What may apply depending on the project', plan.conditional, statusClass)}
      ${sectionFor('What still needs to be clarified', plan.confirm, statusClass)}
      <section class="panel"><div class="section-heading"><div><div class="eyebrow">PREPARE</div><h2>Information to prepare</h2></div></div>
        <p class="muted">Use this as a preparation guide. The City may require additional project-specific information during review.</p>
        <ul class="prep-list">${preparationItems(plan).map(x => '<li>' + escape(x) + '</li>').join('')}</ul>
      </section>
      <section class="panel"><div class="section-heading"><div><div class="eyebrow">PROPERTY</div><h2>Property evidence</h2></div><span class="small">Official Newton GIS context</span></div>
        ${propertyFactsMarkup(property)}
        <p class="small">These facts come from Newton’s official GIS layers. GIS evidence does not by itself determine permit approval.</p>
      </section>
      <div class="view-switch-bottom"><span>Ready to work through the steps?</span><button type="button" class="secondary" id="toChecklist">Open checklist →</button></div>
    </div>

    <div class="result-actions"><button id="editProject" class="secondary">Edit project answers</button><button id="printPlan" class="secondary">Print / save plan</button><button id="downloadProject" class="secondary">Download project backup</button><button id="restart">Start another project</button></div>
    <div id="completionToast" class="completion-toast hidden" role="status" aria-live="polite"><button id="dismissCompletion" class="toast-close" type="button" aria-label="Dismiss">×</button><strong>Planner checklist complete.</strong><span>This does not mean the project is approved or that every construction requirement has been satisfied. Confirm the applicable requirements and approvals before work begins.</span></div>
    <div id="confetti" class="confetti" aria-hidden="true"></div>`;


  const checklistView = $('checklistView');
  const workflowView = $('workflowView');
  const showPlanView = view => {
    checklistView?.classList.toggle('hidden', view !== 'checklist');
    workflowView?.classList.toggle('hidden', view !== 'workflow');
    document.querySelector('.plan-choice')?.classList.toggle('hidden', false);
    document.querySelector('.plan-choice')?.scrollIntoView({behavior:'smooth', block:'start'});
    setTimeout(() => (view === 'checklist' ? checklistView : workflowView)?.scrollIntoView({behavior:'smooth', block:'start'}), 180);
  };
  $('openChecklist')?.addEventListener('click', () => showPlanView('checklist'));
  $('openWorkflow')?.addEventListener('click', () => showPlanView('workflow'));
  $('toChecklist')?.addEventListener('click', () => showPlanView('checklist'));
  $('toWorkflow')?.addEventListener('click', () => showPlanView('workflow'));

  document.querySelectorAll('[data-step]').forEach(cb => {
    if (options.resume && cb.checked) {
      const item = cb.closest('.step-item');
      item?.classList.add('completed','collapsed');
    }

    cb.onchange = () => {
      if (!savedKey) return;
      const current = JSON.parse(storage.get(savedKey) || '{}');
      current.steps = current.steps || plan.steps;
      const index = Number(cb.dataset.step);
      current.steps[index].status = cb.checked ? 'complete' : 'not_started';
      current.updatedAt = new Date().toISOString();
      storage.set(savedKey, JSON.stringify(current));

      const item = cb.closest('.step-item');
      item?.classList.toggle('completed', cb.checked);
      if (!cb.checked) {
        item?.classList.remove('collapsing','collapsed');
      } else {
        setTimeout(() => item?.classList.add('collapsing'), 80);
        setTimeout(() => item?.classList.add('collapsed'), 410);
      }
      updateCompletion(plan);
    };
  });
  $('dismissCompletion').onclick = () => $('completionToast')?.classList.add('hidden');
  $('printPlan').onclick = () => window.print();
  $('downloadProject').onclick = () => downloadProjectFile(savedKey);
  $('editProject').onclick = () => {
    editingFromReview = false;
    r.classList.add('hidden');
    $('questions').classList.remove('hidden');
    questionIndex = 0;
    renderQuestions();
  };
  $('restart').onclick = () => {
    startNewProjectState();
    r.classList.add('hidden'); $('questions').classList.add('hidden');
    document.querySelector('.planner-shell')?.classList.remove('hidden');
    history.pushState(null,'','#plan');
    navigate('plan');
    $('projectType').focus();
    renderSavedProjects();
    window.scrollTo({top:0,behavior:'smooth'});
  };
  window.scrollTo({top:0,behavior:'smooth'});
  updateCompletion(plan);
}


function downloadProjectFile(key) {
  const saved = JSON.parse(storage.get(key) || 'null');
  if (!saved) return;
  const blob = new Blob([JSON.stringify(saved,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'home-project-planner-project.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function slugify(value) {
  return String(value || 'project').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,70) || 'project';
}

function checklistSection(plan) {
  return `<section class="panel checklist-panel combined-workflow">
    <div class="section-heading"><div><div class="eyebrow">PROJECT CHECKLIST</div><h2>What to do next</h2><p class="muted">This is your working project list. Check off each step as you complete it.</p></div><span class="check-count" id="checkCount">0 / ${plan.steps.length}</span></div>
    <div class="checklist-disclaimer">
      <strong>IMPORTANT: A completed checklist does not mean the project is approved or that you are ready to start construction.</strong>
      <span>It means you have worked through the planner's current steps. Requirements can depend on details the planner cannot establish from the available information. Before beginning work, confirm the applicable requirements, approvals, inspections, and property-specific conditions with the appropriate Newton department and qualified professionals.</span>
    </div>
    <ol class="steps">${plan.steps.map((s,i) => {
      const g = stepGuidance[s.id] || stepGuidance.scope;
      const url = sourceById(g.sourceId);
      return `<li class="step-item"><label class="stepcheck"><input data-step="${i}" type="checkbox" ${s.status === 'complete' ? 'checked' : ''}> <b>${i+1}. ${escape(s.title)}</b></label>
        <div class="step-extra"><span class="step-depends">Depends on: ${s.dependsOn.length ? s.dependsOn.join(', ') : 'project scope'}</span>
        <div class="step-guidance"><div class="step-guidance-label">HOW TO COMPLETE THIS STEP</div><p>${escape(g.description)}</p><p class="step-where"><strong>Where to go:</strong> ${escape(g.where)}</p>${url ? '<a class="guidance-button" href="' + escape(url) + '" target="_blank" rel="noreferrer">Open official guidance ↗</a>' : ''}</div></div>
      </li>`;
    }).join('')}</ol>
  </section>`;
}

function updateCompletion(plan) {  const boxes = [...document.querySelectorAll('[data-step]')];
  const done = boxes.filter(x => x.checked).length;
  const count = $('checkCount');
  if (count) count.textContent = `${done} / ${boxes.length}`;
  const complete = done === boxes.length && boxes.length > 0;
  if (complete) {
    $('completionToast')?.classList.remove('hidden');
    if (!checklistWasComplete) launchConfetti();
  } else {
    $('completionToast')?.classList.add('hidden');
  }
  checklistWasComplete = complete;
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
      ${x.indeterminateFacts?.length ? '<p class="small">' + escape('Newton GIS did not return ' + x.indeterminateFacts.map(factLabel).join(', ') + ' for this property, so this item could not be ruled out. Confirm it with the City.') + '</p>' : ''}
      ${tailored && url ? '<div class="result-guidance"><span>Where to start</span><p class="small">' + escape(tailored.where) + '</p><a class="guidance-button" href="' + escape(url) + '" target="_blank" rel="noreferrer">Open the relevant City page ↗</a></div>' : ''}
    </div></article>`;
  }).join('')}</section>`;
}

function factLabel(path) {
  const labels = {'property.yearBuilt':'the year built','property.lotSizeSqFt':'the lot size'};
  return labels[path] || path.split('.').pop();
}

function escape(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}