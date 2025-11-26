import { HTTPException } from 'hono/http-exception';
import { ERROR_STATUSES } from './errorConstants';

export class PortkeyError extends HTTPException {
  constructor(
    public code: string,
    message: string,
    status?: number
  ) {
    const finalStatus =
      status ?? ERROR_STATUSES[code as keyof typeof ERROR_STATUSES] ?? 500;
    super(finalStatus as any, { message });
    this.name = 'PortkeyError';
  }
}
