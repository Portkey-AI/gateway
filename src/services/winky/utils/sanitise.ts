export const sanitize = (value: string | unknown) => {
  if (!value) return null;
  value = value.toString();
  const truncatedValue = (value as string).slice(0, 128).replace(/'/g, "\\'");
  return truncatedValue;
};
