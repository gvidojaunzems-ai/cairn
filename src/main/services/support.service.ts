/**
 * `support.*` service — support ticket stubs.
 */
import type { CoreServiceResult } from '../../contracts/core-service.contract.js';
import { notImplementedResult } from '../ipc/errors.js';

export interface SupportService {
  submit(input: { message: string }): CoreServiceResult<never>;
}

export const supportService: SupportService = {
  submit: (_input) => notImplementedResult('support.submit'),
};
