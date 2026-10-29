/** Parse a Cookie header into a name → value map. */
export const parseCookies = (
  cookieHeader?: string
): Record<string, string> => {
  if (!cookieHeader) return {};

  return cookieHeader.split(';').reduce(
    (acc, cookiePart) => {
      const [rawKey, ...valueParts] = cookiePart.trim().split('=');
      if (!rawKey) return acc;
      const rawValue = valueParts.join('=');
      try {
        acc[rawKey] = decodeURIComponent(rawValue);
      } catch {
        // Browsers share cookies across localhost ports; another service may
        // set a value with a raw '%' that is not valid URI encoding.
        acc[rawKey] = rawValue;
      }
      return acc;
    },
    {} as Record<string, string>
  );
};
