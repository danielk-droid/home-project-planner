// "I'm not sure" clarification: ONE follow-up per question.
//
// When a homeowner answers "I'm not sure", HPP shows exactly one short
// follow-up written for that question. It has no "I'm not sure" option, and
// every answer maps to a definite answer to the original question. Answering
// it records that answer on the original question and hides the follow-up.
//
// FOLLOW_UPS[parentId] = [text, [[value, label, parentValue], ...], note?]
const Y = 'yes', N = 'no';
const yn = (yesLabel = 'Yes', noLabel = 'No') => [[Y, yesLabel, Y], [N, noLabel, N]];

export const FOLLOW_UPS = {
  sleepingRoomAdded: ['What will the new room be used for?', [['sleeping', 'Someone may sleep here', Y], ['other', 'Something else', N]]],
  egressType: ['What will be the way out of this room in an emergency?', [['window', 'An existing window an adult can climb out of', 'window'], ['new', 'A new or bigger window', 'new_window'], ['door', 'A door or bulkhead to the outside', 'bulkhead'], ['other', 'Something else', 'other']]],
  egressKnown: ['Have you measured the escape window or door opening and how high it sits off the floor?', yn()],
  egressMeasurements: ['Do you have the opening measurements written down or on a drawing?', yn()],
  egressException: ['Does this room have a door or bulkhead that leads straight outside, or does the home have fire sprinklers?', yn()],
  bathroomAdded: ['Are you considering adding plumbing fixtures for a bathroom, even if you haven\u2019t decided yet?', yn()],
  electricalWork: ['Will you add, move, or replace any outlets, switches, lights, wiring, or the electrical panel?', yn()],
  plumbingWork: ['Will you add, move, or replace any sink, toilet, tub, shower, pipe, or water heater?', yn()],
  gasWork: ['Will you add, move, replace, or disconnect any gas appliance or gas pipe?', yn()],
  structuralChanges: ['Will you remove or move a wall that holds up the floor or roof, or add, cut, or replace any beams, posts, or joists?', yn()],
  exteriorExpansion: ['Will you add or enlarge a window or door, dig outside, or push out or rebuild any outside wall or roof?', yn()],
  condo: ['Do you pay fees to a condo association, or does your deed list a condo unit?', yn()],
  demolition: ['Will any wall, room, porch, deck, garage, shed, chimney, or siding be torn out rather than repaired?', yn()],
  guttingExtent: ['Roughly how much of the home will be stripped down to the studs?', [[N, 'Less than half', N], [Y, 'More than half', Y]]],
  condoApproval: ['Has the association, building manager, or your condo documents said this work needs approval?', [[Y, 'Yes, approval is needed', Y], [N, 'No, or I have not been told', N]]],
  newVentilation: ['Will you add or replace an exhaust fan, or add or reroute any vent duct to the outside?', yn()],
  newWindow: ['Will you cut a new window, door, or skylight opening, or make an existing one bigger?', yn()],
  layoutChange: ['Will the toilet, sink, tub, or shower move, or will any wall be added, removed, or moved?', yn()],
  deckNew: ['Is there a deck in that spot today?', [['none', 'No, there is nothing there now', Y], ['existing', 'Yes, and it will be replaced', N]]],
  treeImpact: ['Will you dig, build, or park equipment under the branches of any tree, or cut or trim a tree for the work?', yn()],
  stairsOrGuard: ['Will the deck have steps or railings?', yn()],
  windowsOrDoors: ['Will you add a window or exterior door, or make one bigger or move it?', yn()],
  siteWork: ['Will you dig for a foundation, regrade the yard, or build a retaining wall?', yn()],
  footprintChange: ['Will the house cover more or less ground than it does now?', yn()],
  zoningLotEra: ['What does your deed or recorded lot plan show for when the lot was created?', [['before', 'Before December 7, 1953', 'before_1953'], ['after', 'On or after December 7, 1953', 'on_or_after_1953']], 'The year the house was built does not answer this. Only the lot\u2019s recorded creation date does.'],
  zoningRoofType: ['After the project, will the highest part of the roof slope down on its sides?', [['sloped', 'Yes, it slopes (gable, hip, or similar)', 'sloped'], ['flat', 'No, it is flat or nearly flat', 'flat']]],
  primaryWorkArea: ['Which best describes the main work?', [['interior', 'Changing or finishing a room, attic, or basement', 'interior'], ['bath', 'A bathroom', 'bath'], ['kitchen', 'A kitchen', 'kitchen'], ['exterior', 'Roof, siding, windows, doors, deck, or porch', 'exterior'], ['addition', 'Making the house bigger', 'addition'], ['systems', 'Heating, cooling, wiring, plumbing, or gas', 'systems'], ['site', 'Yard, driveway, trees, or drainage', 'site']]],
  systemType: ['Who is doing most of the work?', [['electrical', 'An electrician', 'electrical'], ['plumbing', 'A plumber', 'plumbing'], ['gas', 'A gas fitter', 'gas'], ['mechanical', 'A heating and cooling (HVAC) installer', 'mechanical'], ['mixed', 'Several trades', 'mixed']]],
  mechanicalEquipmentType: ['How will it heat, cool, or move air?', [['furnace', 'Blows warm air through ducts, burning fuel', 'furnace'], ['heat_pump', 'Heats and cools through ducts using electricity', 'heat_pump'], ['central_ac', 'Only cools, through ducts', 'central_ac'], ['boiler', 'Hot water or steam to radiators or baseboards', 'boiler'], ['mini_split', 'Units mounted on the wall or ceiling', 'mini_split'], ['ventilation', 'Only moves fresh air in and out', 'ventilation'], ['other', 'Something else', 'other']]],
  mechanicalInstallation: ['Is there equipment like this in the home today?', [['none', 'No, nothing like it today', 'new'], ['swap', 'Yes, swapped in the same spot', 'replacement'], ['change', 'Yes, and it will be moved or changed', 'alteration']]],
  mechanicalFuel: ['What does the equipment connect to for power or fuel?', [['electric', 'Only electricity', 'electric'], ['gas', 'A natural gas line', 'gas'], ['oil', 'An oil tank', 'oil'], ['other', 'A propane tank or something else', 'other']]],
  mechanicalDuctwork: ['Will any ducts, vents, chimney, flue, or exhaust pipe be added, moved, or changed?', yn()],
  mechanicalElectrical: ['Will the equipment need a new circuit, a new outdoor shut-off switch, or a panel upgrade?', yn()],
  mechanicalGas: ['Will a gas line or gas equipment be added, moved, or disconnected for this work?', yn()],
  mechanicalPlumbing: ['Will water lines, a drain, or boiler or radiator piping be connected or changed?', yn()],
  mechanicalExterior: ['Will an outdoor unit, pad, or new hole through an outside wall or roof be added or moved?', yn()],
  useChange: ['Will any space become a different kind of space, such as a garage or attic becoming living space, a rental, or a business?', yn()],
  unitCountChange: ['Will you add a separate apartment, or combine or remove one?', yn()],
  historicLocalLandmark: ['Has the City, a deed, or a past owner ever said the property is a Newton Local Landmark?', yn()],
  historicPreservationRestriction: ['Does your deed or title report mention a Preservation Restriction?', yn()],
  historicNationalRegister: ['Has a historic database, the City, or a past owner ever said the property is on the National Register?', yn()],
  historicAgeKnown: ['Do you know roughly what year the building was built?', yn()],
  fireProtectionWork: ['Will smoke or carbon monoxide alarms, sprinklers, or a fire alarm system be added, moved, or rewired?', yn()],
  hotWork: ['Will anyone use a torch, open flame, welding, or spark-throwing metal cutting?', yn()],
  landDisturbanceKnown: ['Will you dig, grade, pave, or store equipment on lawn or garden areas outside the house walls?', yn()],
  retainingWallNew: ['Will you build a wall to hold back soil where the ground level changes?', yn()],
  trenchDewatering: ['Has your excavation contractor said water will need to be pumped out while digging?', yn()],
  drainageChange: ['Will you add hard surfaces like roof or paving, regrade the yard, or add gutters, drains, or dry wells?', yn()],
  treeSaveAreaKnown: ['Has an arborist marked tree protection areas for this work?', yn()],
  exteriorChange: ['What kind of exterior change is closest?', [['opening', 'Windows, doors, or another opening', Y], ['structure', 'Deck, porch, addition, or structure', Y], ['surface', 'Roof, siding, or exterior finish', Y], ['site', 'Only ground, trees, drainage, or other site work', N]]],
};

export const FOLLOW_UP_PARENT_IDS = Object.freeze(Object.keys(FOLLOW_UPS));
export const followUpId = parentId => `__clarifier_${parentId}__followup`;
export const followUpGroupKey = parentId => `__followups_${parentId}`;
export const isFollowUpOf = (parentId, id) => typeof id === 'string' && id.startsWith(`__clarifier_${parentId}__`);

// The single follow-up for a parent, as a one-item list (empty when none).
export function followUpsFor(parent) {
  const def = FOLLOW_UPS[parent?.id];
  if (!def) return [];
  const [text, options, note = ''] = def;
  return [{
    id: followUpId(parent.id),
    text,
    kind: 'choice',
    parentId: parent.id,
    followUpGroup: parent.id,
    note,
    options: options.map(([v, l]) => [v, l]),
    why: 'Your answer lets HPP choose the answer to the question above for you.',
  }];
}

// values: {followUpId: chosenValue}. Returns the parent value, or null when
// the follow-up has not been answered.
export function resolveFollowUps(parentId, values = {}) {
  const def = FOLLOW_UPS[parentId];
  if (!def) return null;
  const option = def[1].find(([v]) => v === values[followUpId(parentId)]);
  return option ? option[2] : null;
}
