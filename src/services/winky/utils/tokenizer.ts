export function getBillionTokensValue(modelName: string) {
  const regex = /(\d+(?:\.\d+)?b)/i;
  const match = modelName.match(regex);
  return match ? match[0] : modelName;
}
