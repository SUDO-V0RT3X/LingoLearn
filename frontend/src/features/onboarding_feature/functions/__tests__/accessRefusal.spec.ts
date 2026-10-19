import { describe, expect, it } from 'vitest';
import { Exception, ExceptionType } from '@/core/exceptions/models/ExceptionType';
import {
  accessRefusalFrom,
  LEARNER_SETUP_REQUIRED,
  PARENT_LINK_REQUIRED,
  routeForRefusal,
} from '../accessRefusal';

function failure(statusCode: number, message: string) {
  return new Exception({ exceptionType: ExceptionType.FAILED, message, statusCode });
}

describe('accessRefusalFrom', () => {
  it('nominal: the setup refusal sends the learner to setup', () => {
    expect(accessRefusalFrom(failure(403, LEARNER_SETUP_REQUIRED))).toBe('setupRequired');
    expect(routeForRefusal('setupRequired')).toEqual({ name: 'learnerSetup' });
  });

  it('nominal: the parent-link refusal sends the learner to parent linking', () => {
    expect(accessRefusalFrom(failure(403, PARENT_LINK_REQUIRED))).toBe('parentLinkRequired');
    expect(routeForRefusal('parentLinkRequired')).toEqual({ name: 'parentLinking', query: { blocked: 'under13' } });
  });

  it('boundary: any other 403 is treated as the parent-link rule', () => {
    expect(accessRefusalFrom(failure(403, 'Parent link required'))).toBe('parentLinkRequired');
  });

  it('invalid: errors that are not 403, or no error, are not refusals', () => {
    expect(accessRefusalFrom(failure(500, LEARNER_SETUP_REQUIRED))).toBeNull();
    expect(accessRefusalFrom(failure(404, 'not found'))).toBeNull();
    expect(accessRefusalFrom(null)).toBeNull();
  });
});
