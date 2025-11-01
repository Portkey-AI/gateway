export const externalServiceFetch = async (
  url: string,
  options: RequestInit
) => {
  const response = await fetch(url, options);
  return response;
};
