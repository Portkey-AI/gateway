export const sanitize = (value: string): any => {
  if (!value) return null;
  value = value.toString();
  const truncatedValue = value.slice(0, 128).replace(/'/g, "\\'");
  return truncatedValue;
};

export function getResponse(
  status: string,
  statusCode: number,
  message: string,
  rest?: Record<string, any>
) {
  return new Response(
    JSON.stringify({
      status: status,
      message: message,
      ...rest,
    }),
    {
      status: statusCode,
      headers: {
        'content-type': 'application/json;charset=UTF-8',
      },
    }
  );
}
