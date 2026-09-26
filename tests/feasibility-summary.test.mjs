import assert from 'node:assert/strict';
import { buildPlan } from '../src/core.js';
import { feasibilitySummary } from '../src/feasibility.js';

const property = {resolvedAddress:'TEST ONLY', zoningDistrict:'SR2', lotSizeSqFt:10000, yearBuilt:2000, historicDistrict:null, historicExteriorReview:false, historicStatusUnknown:false, floodplain:false, conservationPotential:false, openPermitsUnknown:false};
const answers = {newArea:400, stories:1, zoningLotEra:'on_or_after_1953', zoningSideSetbackFt:15, zoningRearSetbackFt:15, zoningRoofType:'sloped', zoningHeightFt:36, zoningTotalFloorAreaSqFt:3800, zoningTotalCoverageSqFt:2000};

let summary = feasibilitySummary(buildPlan('addition', property, answers));
assert.equal(summary.level, 'screened');
assert.match(summary.description, /not a zoning determination or approval/i);

summary = feasibilitySummary(buildPlan('addition', property, {...answers, zoningSideSetbackFt:14.9}));
assert.equal(summary.level, 'constraint');
assert.match(summary.description, /zoning relief may be needed/i);

summary = feasibilitySummary(buildPlan('addition', property, {...answers, zoningHeightFt:null}));
assert.equal(summary.level, 'unknown');
assert.match(summary.description, /missing information was not treated as compliance/i);

summary = feasibilitySummary(buildPlan('addition', {...property, yearBuilt:1900}, answers));
assert.equal(summary.level, 'review');
assert.match(summary.title, /historic review/i);

summary = feasibilitySummary(buildPlan('addition', {...property, zoningDistrict:'MR1'}, answers));
assert.equal(summary.level, 'unknown');

console.log('feasibility summary tests passed');