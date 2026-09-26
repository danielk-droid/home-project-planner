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
  },
  deckNew: {
    text:'Which describes the deck work?', kind:'choice',
    options:[['new_deck','A new deck'],['replacement','Replacing an existing deck']]
  },
  guttingExtent: {
    text:'How much of the existing dwelling will be gutted?', kind:'choice',
    options:[['more_than_half','More than half'],['not_more_than_half','Half or less']]
  },
  condo: {
    text:'Which best describes the ownership?', kind:'choice',
    options:[['shared','Condominium or other shared ownership'],['not_shared','Not shared ownership']]
  },
  condoApproval: {
    text:'Does the association require project approval?', kind:'choice',
    options:[['yes','Yes'],['no','No']]
  }
};

export function clarifierForQuestion(question) {
  const entry = CLARIFIERS[question?.id];
  if (!entry) return null;
  return {
    id:'__clarifier_' + question.id,
    text:entry.text,
    kind:entry.kind,
    options:entry.options,
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