import rules from '../data/rules.json' with { type: 'json' };
import sources from '../data/sources.json' with { type: 'json' };
import dependencies from '../data/dependencies.json' with { type: 'json' };
import questionFlows from '../data/questions.json' with { type: 'json' };

export const PROJECTS = Object.fromEntries(questionFlows.map(flow => [flow.id, {
  label: flow.label,
  questions: flow.questions
}]));

export function getQuestions(projectType, answers = {}) {
  const flow = questionFlows.find(x => x.id === projectType);
  if (!flow) return [];
  return flow.questions.filter(q => {
    const all = (q.showWhen || []).every(([key, value]) => answers[key] === value);
    const any = !(q.showWhenAny?.length) || q.showWhenAny.some(([key, value]) => answers[key] === value);
    return all && any;
  });
}

export function answerIsYes(value) { return value === 'yes'; }
export function answerIsNo(value) { return value === 'no'; }
export function answerIsUnsure(value) { return value === 'unsure'; }export function deriveProject(projectType, answers = {}) {
  const a = answers;
  const basementBathroom = a.bathroomAdded === 'yes' || a.bathroomIntent === 'yes';
  const basementPlumbing = a.plumbingWork === 'yes' || basementBathroom;
  const exteriorAnswer = a.exteriorExpansion ?? a.newWindow ?? a.windowsOrDoors;
  const exteriorUncertain = [a.exteriorExpansion, a.newWindow, a.windowsOrDoors, a.siteWork].includes('unsure');
  return {
    buildingWork: true,
    electricalWork: a.electricalWork === 'yes',
    electricalUncertain: a.electricalWork === 'unsure',
    plumbingWork: basementPlumbing || a.plumbingWork === 'yes',
    plumbingUncertain: a.plumbingWork === 'unsure' || a.bathroomAdded === 'unsure' || a.bathroomIntent === 'unsure',
    gasWork: a.gasWork === 'yes',
    gasUncertain: a.gasWork === 'unsure',
    structuralChanges: a.structuralChanges === 'yes',
    structuralUncertain: a.structuralChanges === 'unsure',
    exteriorConstruction: projectType === 'deck' || projectType === 'addition' || exteriorAnswer === 'yes',
    exteriorUncertain,
    expansion: projectType === 'addition' || a.exteriorExpansion === 'yes' || a.siteWork === 'yes',
    sleepingRoomAdded: a.sleepingRoomAdded === 'yes' || a.sleepingUse === 'sleeping',
    sleepingRoomUncertain: a.sleepingRoomAdded === 'unsure' || a.sleepingUse === 'unsure',
    bathroomAdded: basementBathroom,
    bathroomUncertain: a.bathroomAdded === 'unsure' || a.bathroomIntent === 'unsure',
    ventilationWork: a.newVentilation === 'yes',
    ventilationUncertain: a.newVentilation === 'unsure',
    windowWork: a.newWindow === 'yes' || a.windowsOrDoors === 'yes',
    windowUncertain: a.newWindow === 'unsure' || a.windowsOrDoors === 'unsure',
    treeImpact: a.treeImpact === 'yes' || a.treeImpact === 'unsure',
    treeImpactUncertain: a.treeImpact === 'unsure'
  };
}

export function buildPlan(projectType, property, answers) {
  const project = deriveProject(projectType, answers);
  const ctx = {property, project, answers};
  const results = evaluateRules(ctx);
  const required = results.filter(r => r.status === 'required');
  const conditional = results.filter(r => r.status === 'potentially_required');
  const confirm = results.filter(r => r.status === 'needs_confirmation');
  const steps = dependencies.map(d => ({...d, status:'not_started'}));
  const unknowns = Object.entries(answers || {}).filter(([, value]) => value === 'unsure').map(([key]) => key);
  return {project, results, required, conditional, confirm, steps, context:ctx, unknowns};
}}