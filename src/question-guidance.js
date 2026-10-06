// Question-layer guidance shared by the browser UI and regression tests.
// Only questions with a genuinely diagnostic follow-up belong here. An
// unresolved factual choice remains "unsure" rather than being converted by a
// generic yes/no question that cannot answer it.
const CLARIFIERS = {
  structuralChanges: {
    text:'Which structural parts will actually change?', kind:'multi',
    options:[['walls','Walls or partitions'],['framing','Framing, beams, columns, or joists'],['foundation','Foundation or below-grade structure'],['none','None of these']]
  },
  electricalWork: {
    text:'Which electrical work is part of the project?', kind:'multi',
    options:[['circuits','Wiring or circuits'],['service','Electrical service or panel'],['fixtures','Fixtures, outlets, or lighting'],['equipment','Electrical equipment'],['none','None of these']]
  },
  plumbingWork: {
    text:'Which plumbing work is part of the project?', kind:'multi',
    options:[['fixtures','Fixtures or appliances'],['pipes','Supply, drain, or vent lines'],['layout','Moving plumbing locations'],['equipment','Plumbing equipment'],['none','None of these']]
  },
  gasWork: {
    text:'Which gas work is part of the project?', kind:'multi',
    options:[['equipment','Gas equipment or appliance'],['piping','Gas piping'],['new','New gas service or equipment'],['none','None of these']]
  },
  exteriorChange: {
    text:'Which exterior work is part of the project?', kind:'multi',
    options:[['openings','Windows, doors, or another opening'],['structure','Deck, porch, addition, or structure'],['envelope','Roof, siding, or exterior finish'],['site','Ground, trees, drainage, or paving'],['none','None of these']]
  },
  siteWork: {
    text:'Which site work is part of the project?', kind:'multi',
    options:[['grading','Grading or excavation'],['drainage','Drainage or stormwater'],['trees','Trees or landscaping'],['paving','Driveway, parking, or paving'],['none','None of these']]
  },
  treeImpact: {
    text:'Which tree-related condition is part of the project?', kind:'multi',
    options:[['nearby','Construction near trees'],['removal','Tree removal'],['protection','Tree protection or root-area work'],['planting','Tree planting as part of construction'],['none','None of these']]
  },
  windowsOrDoors: {
    text:'Which exterior opening work is part of the project?', kind:'multi',
    options:[['window','Windows'],['door','Exterior doors'],['both','Both windows and doors'],['none','None of these']]
  },
  newVentilation: {
    text:'Which ventilation work is part of the project?', kind:'multi',
    options:[['bath','Bathroom exhaust'],['whole','Whole-home or room ventilation'],['ducts','New or altered ductwork'],['equipment','Ventilation equipment'],['none','None of these']]
  },
  layoutChange: {
    text:'Which bathroom layout change is part of the project?', kind:'multi',
    options:[['walls','Removing or adding walls'],['fixtures','Moving fixtures'],['room','Changing the room layout'],['none','None of these']]
  },
  stairsOrGuard: {
    text:'Which deck safety elements are part of the project?', kind:'multi',
    options:[['stairs','New stairs'],['guards','Guards or railings'],['both','Both stairs and guards'],['none','None of these']]
  },
  footprintChange: {
    text:'How might the building footprint change?', kind:'multi',
    options:[['increase','Increasing the footprint'],['decrease','Decreasing the footprint'],['reconfigure','Otherwise changing the footprint'],['none','It will not change']]
  },
  demolition: {
    text:'What might be removed?', kind:'multi',
    options:[['interior','Interior walls or finishes'],['exterior','Exterior elements'],['structure','Structural parts'],['none','None of these']]
  }
};

// Every follow-up keeps an honest way out: "I still don't know" leaves the
// original answer as "unsure" (NEEDS_CONFIRMATION) instead of forcing a guess.
export const STILL_UNSURE = ['unsure', "I still don't know"];
export function withStillUnsure(options = []) {
  return options.some(([value]) => value === 'unsure') ? options : [...options, STILL_UNSURE];
}

export function clarifierForQuestion(question) {
  const entry = CLARIFIERS[question?.id];
  if (!entry) return null;
  return {
    id:'__clarifier_' + question.id,
    text:entry.text,
    kind:entry.kind,
    options:withStillUnsure(entry.options),
    why:'This narrows the uncertainty using concrete parts of the proposed work.'
  };
}

export function questionContext(question, property = {}) {
  if (question?.id === 'zoningLotEra') {
    const raw = property?.yearBuilt;
    const year = typeof raw === 'number' ? raw : (typeof raw === 'string' && /^\s*\d{4}\s*$/.test(raw) ? Number(raw) : null);
    if (Number.isInteger(year) && year > 0) {
      return `Newton's property record lists the building year as ${year}. That is not the same as the date the legal lot was created, so HPP cannot answer this question from the building year.`;
    }
    return 'The legal lot-creation date is not available from the property facts HPP received. If you are unsure, HPP will compare every still-possible limit and identify what needs City confirmation.';
  }
  if (question?.id === 'zoningRoofType') {
    return 'Choose the roof form at the house’s highest point. If you are unsure, HPP will compare both published height limits and keep any differing outcome uncertain.';
  }
  return '';
}

export const CLARIFIER_QUESTION_IDS = Object.freeze(Object.keys(CLARIFIERS));
// Contextual "I'm not sure" guidance. Plain homeowner language: what the
// question means, how to find out, and what HPP does while it stays unsure.
// It never asserts a legal outcome; an unresolved answer stays "unsure".
const PLANS = 'your contractor, designer, or architect';
const ISD = 'Newton Inspectional Services';
const UNSURE_HELP = {
  sleepingRoomAdded: 'A sleeping room is any room someone may regularly sleep in, even if you do not call it a bedroom. Sleeping rooms need emergency escape openings.',
  egressType: 'This is how someone could get out in an emergency — usually a large enough window or an exterior door. ' + PLANS + ' can confirm which one is planned.',
  egressKnown: 'This means the size of the window or door opening and how high it sits above the floor and ground outside. A tape measure or your plans usually answer it.',
  egressMeasurements: 'Measurements come from your plans or from measuring the opening yourself. Without them, HPP lists the escape opening as something to confirm.',
  egressException: 'Some existing conditions (like a bulkhead door or sprinklers) can change escape requirements. ' + ISD + ' decides whether an exception applies.',
  bathroomAdded: 'A new bathroom means adding a toilet, shower, or tub where there is none today. Replacing existing fixtures in place is not a new bathroom.',
  electricalWork: 'This includes new outlets, lights, switches, circuits, or panel work — even small changes. An electrician can tell you what the plan needs.',
  plumbingWork: 'This includes adding, moving, or changing sinks, toilets, showers, water heaters, or pipes. A plumber can tell you what the plan needs.',
  gasWork: 'This includes new or moved gas lines and gas appliances such as stoves, dryers, heaters, or fireplaces.',
  structuralChanges: 'Structural parts hold the house up: load-bearing walls, beams, posts, joists, and framing. ' + PLANS + ' or an engineer can tell you if any change.',
  exteriorExpansion: 'This covers anything that changes the outside shell: new or bigger windows or doors, digging outside, or pushing walls out.',
  condo: 'Your deed or tax bill shows whether the home is a condominium or other shared ownership.',
  demolition: 'This means tearing out or substantially removing walls, rooms, structures, or exterior parts — not just replacing finishes.',
  guttingExtent: 'Gutting means stripping a space down to the framing. Compare the area being gutted with the whole home to estimate the share.',
  condoApproval: 'Your condominium documents or association manager can tell you whether projects need association approval.',
  newVentilation: 'This includes new bathroom or kitchen exhaust fans, ducts, or ventilation equipment.',
  newWindow: 'This means a new window or door opening, or making an existing one larger. Replacing a window in the same opening is different.',
  layoutChange: 'A layout change means moving fixtures or walls, not just replacing them in place.',
  deckNew: 'A new deck is built where there is none now; a replacement rebuilds an existing deck.',
  treeImpact: 'Digging, grading, or storing materials near trees — including a neighbor’s tree — can affect their roots.',
  stairsOrGuard: 'Guards are railings along raised deck edges. New stairs or railings have their own safety rules.',
  windowsOrDoors: 'This means adding, enlarging, or moving exterior windows or doors.',
  siteWork: 'Site work means grading, digging, retaining walls, or other changes to the ground around the house.',
  footprintChange: 'The footprint is the outline of the house on the ground. Additions, porches, and removals can change it.',
  zoningLotEra: 'This asks when the legal lot was created, not when the house was built. The Middlesex South Registry of Deeds or Newton Planning staff can confirm it.',
  zoningRoofType: 'Look at the highest part of the roof: a sloped (pitched) roof or a flat roof. ' + PLANS + ' can confirm the planned roof form.',
  primaryWorkArea: 'Pick the part of the home that most of the work affects. HPP will ask a short follow-up if you are unsure.',
  systemType: 'Pick the main system being worked on, such as heating, cooling, electrical, or plumbing. Your installer can confirm.',
  mechanicalEquipmentType: 'This is the heating, cooling, or ventilation equipment involved. Your installer’s quote usually names it.',
  mechanicalInstallation: 'New equipment, a like-for-like replacement, or equipment being moved can each follow a different path. Your installer can confirm.',
  mechanicalFuel: 'The fuel is what powers the equipment: gas, oil, electric, or propane. The equipment label or quote shows it.',
  mechanicalDuctwork: 'This includes new or changed ducts, vents, or exhaust/chimney venting.',
  mechanicalElectrical: 'New circuits or panel work for the equipment count here. Your installer can confirm.',
  mechanicalGas: 'New or moved gas lines for the equipment count here.',
  mechanicalPlumbing: 'Water, drain, or hot-water heating connections count here.',
  mechanicalExterior: 'Outdoor units, wall or roof penetrations, or pads and platforms count here.',
  useChange: 'A change of use means using a room or building for something different, such as turning a garage into living space.',
  unitCountChange: 'This asks whether the number of separate homes on the property will go up or down, for example by adding an apartment.',
  historicLocalLandmark: 'Newton Historic Preservation staff can tell you whether the property is a designated Local Landmark.',
  historicPreservationRestriction: 'A Preservation Restriction is recorded on the deed. The Registry of Deeds or Newton Historic Preservation staff can confirm.',
  historicNationalRegister: 'The Massachusetts Historical Commission’s MACRIS database lists National Register properties.',
  historicAgeKnown: 'Newton’s property record often shows the building year; it can be approximate. Newton Historic Preservation staff can confirm.',
  fireProtectionWork: 'This includes smoke or CO alarms, sprinklers, or fire alarm systems being added or changed.',
  hotWork: 'Hot work means torches, welding, or other open-flame work. Your contractor can tell you if it is planned.',
  landDisturbanceKnown: 'This means digging, grading, or paving outside the existing house outline.',
  retainingWallNew: 'A retaining wall holds back soil where the ground level changes.',
  trenchDewatering: 'Dewatering means pumping groundwater out of a trench while it is dug. Your excavation contractor can tell you.',
  drainageChange: 'This asks whether the project changes where rainwater flows, such as new roofs, paving, or regrading.',
  treeSaveAreaKnown: 'A Tree Save Area is the protected zone around a protected tree’s roots, including a neighbor’s tree near the property line. An arborist can help.',
  exteriorChange: 'This covers anything that changes the outside of the building or adds exterior construction.'
};

export function unsureGuidance(question) {
  if (!question?.id) return '';
  const specific = UNSURE_HELP[question.id];
  const base = specific || 'This answer can change which permits and reviews apply. ' + PLANS + ' or ' + ISD + ' can help you answer it.';
  return base;
}
