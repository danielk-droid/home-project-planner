const HISTORIC_AGE_RULE_ID = 'property.historic-age';
const YEAR_BUILT_FACT = 'property.yearBuilt';

export const HISTORIC_AGE_UNKNOWN_ACTION =
  'Year-built information was not returned by the property record, so the building-age condition could not be established from that record. Confirm the applicable Newton Historical Commission review for exterior alterations before relying on the standard building workflow.';

export function actionForResult(result) {
  if (
    result?.id === HISTORIC_AGE_RULE_ID &&
    result.indeterminateFacts?.includes(YEAR_BUILT_FACT)
  ) {
    return HISTORIC_AGE_UNKNOWN_ACTION;
  }

  return result?.action ?? '';
}