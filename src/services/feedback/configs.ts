export const globals = {
  allowedRequestMethods: ['POST', 'PUT'],
  requiredRequestBodyKeysPost: ['trace_id', 'value'],
  requiredRequestBodyKeysPut: ['value'],
  defaultWeight: 1,
  maxWeight: 1,
  minWeight: 0,
  minValue: -10,
  maxValue: 10,
  indexibleMetaDataKeysMaxLength: 128,
  defaultSource: 'API',
};
