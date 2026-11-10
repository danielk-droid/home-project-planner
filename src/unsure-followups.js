// Tailored "I'm not sure" follow-ups.
//
// When a homeowner answers "I'm not sure", HPP asks 2-3 short follow-up
// questions written for that exact question. Their answers select the original
// answer for the homeowner, and only when the evidence supports it:
//
//   mode 'any'   (does the work include X?)
//                yes  -> any follow-up points to yes
//                no   -> nothing points to yes, at least one points to no,
//                        and no follow-up was answered "I don't know"
//   mode 'agree' (what is the fact?)
//                a value -> every follow-up that points somewhere points to
//                           the same value
//
// Anything else leaves the original answer "unsure", so the plan lists it as
// needing confirmation. Each option is [value, label, parentValue|null].
// "I don't know" is appended to every follow-up and never resolves anything.
const Y = 'yes', N = 'no';
const yn = (yesLabel = 'Yes', noLabel = 'No') => [[Y, yesLabel, Y], [N, noLabel, N]];
const yesOnly = (yesLabel = 'Yes', noLabel = 'No') => [[Y, yesLabel, Y], [N, noLabel, null]];
const thisYear = new Date().getFullYear();

export const DONT_KNOW = ['unsure', "I don't know", null];

export const FOLLOW_UPS = {
  electricalWork: {mode: 'any', questions: [
    ['outlets', 'Will you add, move, or replace any outlets, switches, or light fixtures?', yn()],
    ['circuit', 'Will any new appliance or equipment need its own new circuit (for example an oven, heat pump, or EV charger)?', yn()],
    ['panel', 'Will the electrical panel or service be replaced or upgraded?', yn()],
  ]},
  plumbingWork: {mode: 'any', questions: [
    ['fixtures', 'Will you add, move, or replace any sink, toilet, tub, or shower?', yn()],
    ['pipes', 'Will any water, drain, or vent pipes be added or moved?', yn()],
    ['appliances', 'Will you add or replace a water heater, dishwasher, or washing-machine hookup?', yn()],
  ]},
  gasWork: {mode: 'any', questions: [
    ['appliance', 'Will you add, move, or replace any gas appliance (stove, dryer, furnace, water heater, or fireplace)?', yn()],
    ['pipe', 'Will any gas pipe be added, extended, moved, or capped?', yn()],
    ['switch', 'Will any appliance switch from gas to electric, or from electric to gas?', yn()],
  ]},
  structuralChanges: {mode: 'any', questions: [
    ['bearing', 'Will you remove or move a wall that holds up the floor or roof above it?', yn()],
    ['framing', 'Will any beams, posts, joists, or rafters be added, cut, or replaced?', yn()],
    ['openings', 'Will you cut new openings in walls, floors, or the roof, or work on the foundation?', yn()],
  ]},
  exteriorExpansion: {mode: 'any', questions: [
    ['opening', 'Will you add a new window or door, or make one bigger?', yn()],
    ['dig', 'Will you dig outside the house (for example for a foundation, bulkhead, or window well)?', yn()],
    ['walls', 'Will any outside wall or roof be pushed out, raised, or rebuilt?', yn()],
  ]},
  condo: {mode: 'agree', questions: [
    ['deed', 'What does your deed or tax bill show?', [[Y, 'It says “condominium” or lists a condo unit', Y], [N, 'One deed covers the whole property, no condo', N]]],
    ['fees', 'Do you pay fees to a condo or homeowners association?', yesOnly()],
  ]},
  demolition: {mode: 'any', questions: [
    ['walls', 'Will any wall be torn out (not just repainted or re-covered)?', yn()],
    ['structures', 'Will any room, porch, deck, garage, or shed be taken down?', yn()],
    ['exterior', 'Will siding, a chimney, or part of the roof be removed rather than repaired?', yn()],
  ]},
  guttingExtent: {mode: 'agree', questions: [
    ['share', 'Roughly how much of the home will be stripped down to the studs?', [[N, 'Less than half', N], [Y, 'More than half', Y]]],
    ['rooms', 'Will most rooms in the home be stripped down to the framing?', yn()],
  ]},
  condoApproval: {mode: 'agree', questions: [
    ['documents', 'What do your condo documents (master deed or bylaws) say about renovations?', [[Y, 'They require association approval', Y], [N, 'They do not require approval for this work', N], ['unread', 'I have not read them', null]]],
    ['manager', 'Has the association or building manager told you whether approval is needed?', [[Y, 'Yes, approval is needed', Y], [N, 'Yes, approval is not needed', N], ['notasked', 'I have not asked', null]]],
  ]},
  newVentilation: {mode: 'any', questions: [
    ['fan', 'Will you add or replace a bathroom or kitchen exhaust fan?', yn()],
    ['duct', 'Will any vent duct be added or rerouted to the outside?', yn()],
  ]},
  newWindow: {mode: 'any', questions: [
    ['cut', 'Will you cut a new window or door opening in a wall?', yn()],
    ['enlarge', 'Will an existing window or door opening be made bigger?', yn()],
    ['skylight', 'Will you add a skylight or another opening to the outside?', yn()],
  ]},
  layoutChange: {mode: 'any', questions: [
    ['move', 'Will the toilet, sink, tub, or shower move to a new spot?', yn()],
    ['walls', 'Will any wall be added, removed, or moved?', yn()],
  ]},
  deckNew: {mode: 'agree', questions: [
    ['existing', 'Is there a deck in that spot today?', [[N, 'No, there is nothing there now', Y], [Y, 'Yes, and it will be rebuilt', N]]],
    ['size', 'Compared with any deck there today, will the new one be bigger or higher?', [[Y, 'Yes, bigger or higher', Y], ['same', 'Same size and height', N], ['none', 'There is no deck there now', Y]]],
  ]},
  treeImpact: {mode: 'any', questions: [
    ['branches', 'Will you dig, build, or park equipment under the branches of any tree (yours or a neighbor’s)?', yn()],
    ['cut', 'Will any tree be cut down or trimmed for the work?', yn()],
  ]},
  stairsOrGuard: {mode: 'any', questions: [
    ['steps', 'Will the deck have steps down to the ground or to another level?', yn()],
    ['railing', 'Will the deck have railings along any edge?', yn()],
    ['height', 'Will any part of the deck surface be more than 30 inches above the ground?', [[Y, 'Yes', Y], [N, 'No', null]]],
  ]},
  windowsOrDoors: {mode: 'any', questions: [
    ['add', 'Will you add a new window or exterior door?', yn()],
    ['change', 'Will any window or exterior door be made bigger or moved?', yn()],
  ]},
  siteWork: {mode: 'any', questions: [
    ['dig', 'Will you dig for a foundation or regrade the yard?', yn()],
    ['wall', 'Will you build a retaining wall?', yn()],
    ['paving', 'Will you add or change a driveway, patio, or yard drainage?', yn()],
  ]},
  footprintChange: {mode: 'any', questions: [
    ['grow', 'Will the house cover more ground than it does now (for example an addition, porch, or garage)?', yn()],
    ['shrink', 'Will any part of the house that sits on the ground be removed or moved?', yn()],
  ]},
  zoningLotEra: {mode: 'agree', note: 'The year the house was built does not answer this. Only the lot’s recorded creation date does.', questions: [
    ['deed', 'What does your deed or the recorded lot plan show for when the lot was created?', [['before', 'Recorded before December 7, 1953', 'before_1953'], ['after', 'Recorded on or after December 7, 1953', 'on_or_after_1953'], ['unchecked', 'I have not checked', null]]],
    ['planning', 'Has Newton Planning staff confirmed when the lot was created?', [['before', 'Yes, before December 7, 1953', 'before_1953'], ['after', 'Yes, on or after December 7, 1953', 'on_or_after_1953'], [N, 'No', null]]],
  ]},
  zoningRoofType: {mode: 'agree', questions: [
    ['shape', 'After the project, will the highest part of the roof slope down on its sides?', [['sloped', 'Yes, it slopes (gable, hip, or similar)', 'sloped'], ['flat', 'No, it is flat or nearly flat', 'flat']]],
    ['plans', 'What do your plans or designer show for the highest roof?', [['sloped', 'A sloped roof', 'sloped'], ['flat', 'A flat roof', 'flat'], ['noplans', 'No plans yet', null]]],
  ]},
  egressType: {mode: 'agree', questions: [
    ['window', 'Does the room already have a window big enough for an adult to climb out of?', [['window', 'Yes, an existing window', 'window'], ['new', 'No, a window will be added or enlarged', 'new_window'], ['door', 'No, escape is through a door or bulkhead to the outside', 'bulkhead']]],
    ['plans', 'What do your plans show as the way out of this room in an emergency?', [['window', 'An existing window', 'window'], ['new', 'A new or bigger window', 'new_window'], ['door', 'A door or bulkhead to the outside', 'bulkhead'], ['other', 'Something else', 'other'], ['noplans', 'No plans yet', null]]],
  ]},
  egressKnown: {mode: 'any', questions: [
    ['measured', 'Have you measured the escape window or door opening and how high it sits off the floor?', yn()],
    ['plans', 'Do your plans show the opening size and its height above the floor and ground?', yn()],
  ]},
  egressMeasurements: {mode: 'any', questions: [
    ['written', 'Do you have the opening measurements written down or on a drawing?', yn()],
    ['contractor', 'Has your contractor or designer given you the exact opening size?', yn()],
  ]},
  egressException: {mode: 'any', questions: [
    ['door', 'Does this room have a door or bulkhead that leads straight outside?', yn()],
    ['sprinkler', 'Does the home have a fire sprinkler system?', yn()],
    ['told', 'Has an inspector or designer told you an exception might apply?', yn()],
  ]},
  systemType: {mode: 'agree', questions: [
    ['work', 'What is the main thing being installed or fixed?', [['electrical', 'Wiring, outlets, the panel, or lights', 'electrical'], ['plumbing', 'Pipes, fixtures, or a water heater', 'plumbing'], ['gas', 'A gas line or gas hookup', 'gas'], ['mechanical', 'Heating, cooling, or ventilation equipment', 'mechanical'], ['mixed', 'More than one of these', 'mixed']]],
    ['trade', 'Who is doing most of the work?', [['electrical', 'An electrician', 'electrical'], ['plumbing', 'A plumber', 'plumbing'], ['gas', 'A gas fitter', 'gas'], ['mechanical', 'A heating and cooling (HVAC) installer', 'mechanical'], ['mixed', 'Several trades', 'mixed'], ['nobody', 'Not hired yet', null]]],
  ]},
  mechanicalEquipmentType: {mode: 'agree', questions: [
    ['quote', 'What does the quote or the equipment label call it?', [['furnace', 'Furnace', 'furnace'], ['boiler', 'Boiler', 'boiler'], ['heat_pump', 'Heat pump (ducted)', 'heat_pump'], ['central_ac', 'Central air conditioner', 'central_ac'], ['mini_split', 'Mini-split (wall or ceiling units)', 'mini_split'], ['ventilation', 'Ventilation or air exchanger', 'ventilation'], ['other', 'Something else', 'other'], ['noquote', 'No quote yet', null]]],
    ['heat', 'How does it deliver heat or cooling?', [['air', 'Air through ducts and vents', null], ['water', 'Hot water or steam to radiators or baseboards', 'boiler'], ['wall', 'Units mounted on the wall or ceiling', 'mini_split'], ['fresh', 'It only moves fresh air in and out', 'ventilation']]],
  ]},
  mechanicalInstallation: {mode: 'agree', questions: [
    ['today', 'Is there equipment like this in the home today?', [['none', 'No, nothing like it today', 'new'], ['swap', 'Yes, and it will be swapped in the same spot', 'replacement'], ['change', 'Yes, and it will be moved or changed', 'alteration']]],
    ['quote', 'What does your installer’s quote call the job?', [['new', 'New installation', 'new'], ['replacement', 'Replacement', 'replacement'], ['alteration', 'Relocation or modification', 'alteration'], ['noquote', 'No quote yet', null]]],
  ]},
  mechanicalFuel: {mode: 'agree', questions: [
    ['connects', 'What does the equipment connect to for power or fuel?', [['electric', 'Only electricity', 'electric'], ['gas', 'A natural gas line', 'gas'], ['oil', 'An oil tank', 'oil'], ['other', 'A propane tank or something else', 'other']]],
    ['bill', 'Which bill or delivery will pay for running it?', [['electric', 'Electric bill only', 'electric'], ['gas', 'Gas bill', 'gas'], ['oil', 'Oil deliveries', 'oil'], ['other', 'Propane or another fuel', 'other']]],
  ]},
  mechanicalDuctwork: {mode: 'any', questions: [
    ['ducts', 'Will any ducts or vents be added, moved, or resized?', yn()],
    ['flue', 'Will a chimney, flue, or exhaust vent pipe be added or changed?', yn()],
  ]},
  mechanicalElectrical: {mode: 'any', questions: [
    ['circuit', 'Will the equipment need a new circuit or a new outdoor disconnect switch?', yn()],
    ['panel', 'Will the electrical panel be upgraded for it?', yn()],
  ]},
  mechanicalGas: {mode: 'any', questions: [
    ['line', 'Will a gas line be added, extended, or moved for this equipment?', yn()],
    ['equipment', 'Will gas equipment be added, moved, or disconnected?', yn()],
  ]},
  mechanicalPlumbing: {mode: 'any', questions: [
    ['water', 'Will water lines, a drain, or a condensate line be connected?', yn()],
    ['hydronic', 'Will boiler, radiator, or baseboard piping be added or changed?', yn()],
  ]},
  mechanicalExterior: {mode: 'any', questions: [
    ['unit', 'Will an outdoor unit be added or moved?', yn()],
    ['holes', 'Will new holes be cut through an outside wall or the roof?', yn()],
    ['pad', 'Will you build a pad, platform, or stand outside?', yn()],
  ]},
  useChange: {mode: 'any', questions: [
    ['room', 'Will any space become a different kind of space (for example a garage or attic becoming living space)?', yn()],
    ['business', 'Will any part of the property be used for a business, rental, or something other than how it is used today?', yn()],
  ]},
  unitCountChange: {mode: 'any', questions: [
    ['add', 'Will you add a separate apartment with its own kitchen and entrance?', yn()],
    ['remove', 'Will you combine two units into one or remove an apartment?', yn()],
  ]},
  historicLocalLandmark: {mode: 'agree', questions: [
    ['list', 'Have you checked Newton’s list of Local Landmarks?', [[Y, 'Yes, the property is on it', Y], [N, 'Yes, the property is not on it', N], ['unchecked', 'I have not checked', null]]],
    ['notice', 'Has the City ever told you the property is a Local Landmark?', yesOnly()],
  ]},
  historicPreservationRestriction: {mode: 'agree', questions: [
    ['deed', 'Does your deed or title report mention a Preservation Restriction?', [[Y, 'Yes, it mentions one', Y], [N, 'I checked, and it does not', N], ['unchecked', 'I have not checked', null]]],
    ['holder', 'Has a preservation group told you it holds a restriction on the property?', yesOnly()],
  ]},
  historicNationalRegister: {mode: 'agree', questions: [
    ['macris', 'Have you looked up the property in MACRIS, the state historic database?', [[Y, 'Yes, it is listed on the National Register', Y], [N, 'Yes, it is not listed', N], ['unchecked', 'I have not checked', null]]],
    ['district', 'Is the home inside a National Register historic district?', yesOnly()],
  ]},
  historicAgeKnown: {mode: 'agree', questions: [
    ['built', 'When was the building built?', [['old', `In ${thisYear - 51} or earlier`, Y], ['near', `In ${thisYear - 50}`, null], ['new', `In ${thisYear - 49} or later`, N]]],
    ['confirmed', 'Has Newton Historic Preservation staff confirmed the building’s age?', [[Y, 'Yes, it is 50 or more years old', Y], [N, 'Yes, it is under 50 years old', N], ['notasked', 'No', null]]],
  ]},
  fireProtectionWork: {mode: 'any', questions: [
    ['alarms', 'Will smoke or carbon monoxide alarms be added, moved, or rewired?', yn()],
    ['sprinklers', 'Will sprinklers or a fire alarm system be added or changed?', yn()],
  ]},
  hotWork: {mode: 'any', questions: [
    ['flame', 'Will anyone use a torch or open flame (for example soldering pipes or torch-down roofing)?', yn()],
    ['sparks', 'Will there be welding, or metal cutting that throws sparks?', yn()],
  ]},
  landDisturbanceKnown: {mode: 'any', questions: [
    ['dig', 'Will you dig, grade, or pave anywhere outside the house walls?', yn()],
    ['staging', 'Will equipment, materials, or a dumpster sit on lawn or garden areas?', yn()],
  ]},
  retainingWallNew: {mode: 'any', questions: [
    ['wall', 'Will you build a wall to hold back soil where the ground level changes?', yn()],
    ['slope', 'Will any part of the yard be dug into a slope or raised with fill?', [[Y, 'Yes', null], [N, 'No', N]]],
  ]},
  trenchDewatering: {mode: 'any', questions: [
    ['pump', 'Has your excavation contractor said water will need to be pumped out while digging?', yn()],
    ['trench', 'Will there be any trenches or deep digging at all?', [[Y, 'Yes', null], [N, 'No', N]]],
  ]},
  drainageChange: {mode: 'any', questions: [
    ['hard', 'Will you add roof, paving, or other hard surface that rain can’t soak into?', yn()],
    ['flow', 'Will you regrade the yard or add gutters, drains, or dry wells?', yn()],
  ]},
  treeSaveAreaKnown: {mode: 'agree', questions: [
    ['trees', 'Are there any trees near where you will dig, build, or store materials, on your lot or a neighbor’s?', [[Y, 'Yes', Y], [N, 'No, there are no trees near the work', N]]],
    ['arborist', 'Has an arborist marked tree protection areas for this work?', [['enters', 'Yes, and the work goes into one', Y], ['outside', 'Yes, and the work stays outside them', N], ['noarborist', 'No arborist yet', null]]],
  ]},
};

export const FOLLOW_UP_PARENT_IDS = Object.freeze(Object.keys(FOLLOW_UPS));
export const followUpId = (parentId, key) => `__clarifier_${parentId}__${key}`;
export const followUpGroupKey = parentId => `__followups_${parentId}`;
export const isFollowUpOf = (parentId, id) => typeof id === 'string' && id.startsWith(`__clarifier_${parentId}__`);

// Synthetic follow-up questions for a parent (empty when it has none).
export function followUpsFor(parent) {
  const def = FOLLOW_UPS[parent?.id];
  if (!def) return [];
  return def.questions.map(([key, text, options], i) => ({
    id: followUpId(parent.id, key),
    text,
    kind: 'choice',
    parentId: parent.id,
    followUpGroup: parent.id,
    note: i === 0 ? def.note || '' : '',
    options: [...options.map(([v, l]) => [v, l]), [DONT_KNOW[0], DONT_KNOW[1]]],
    why: 'Your answer helps HPP choose the answer to the question above for you.',
  }));
}

// values: {followUpId: chosenValue}. Returns the parent value, or null when
// the evidence does not settle it.
export function resolveFollowUps(parentId, values = {}) {
  const def = FOLLOW_UPS[parentId];
  if (!def) return null;
  const mapped = [];
  let dontKnow = false;
  for (const [key, , options] of def.questions) {
    const v = values[followUpId(parentId, key)];
    if (v === undefined || v === null) continue;
    if (v === DONT_KNOW[0]) { dontKnow = true; continue; }
    const option = options.find(([ov]) => ov === v);
    if (option && option[2] != null) mapped.push(option[2]);
  }
  if (def.mode === 'any') {
    if (mapped.includes(Y)) return Y;
    if (!dontKnow && mapped.includes(N)) {
      const answeredAll = def.questions.every(([key]) => values[followUpId(parentId, key)] != null);
      return answeredAll ? N : null;
    }
    return null;
  }
  const distinct = [...new Set(mapped)];
  return distinct.length === 1 ? distinct[0] : null;
}
