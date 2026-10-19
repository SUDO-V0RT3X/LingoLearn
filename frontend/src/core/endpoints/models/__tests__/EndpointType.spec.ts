import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpService, RequestMethod } from '@/core/http/functions/httpService';
import { $Endpoint } from '../EndpointType';

// A failed request is logged by method, path and status only: the body (here a
// password) and the raw axios error, whose config carries that body, never
// reach the console.
const SECRET = 'correct-horse-battery';

function loginEndpoint() {
  return new $Endpoint<{ token: string }>({
    method: RequestMethod.POST,
    route: '/api/auth/login',
    jsonBody: { identifier: 'one_learner', password: SECRET },
    responseParser: (response) => response.data,
  });
}

function everythingLogged(): string {
  const calls = [
    ...vi.mocked(console.log).mock.calls,
    ...vi.mocked(console.warn).mock.calls,
    ...vi.mocked(console.error).mock.calls,
  ];
  return JSON.stringify(calls);
}

describe('$Endpoint failure logging', () => {
  afterEach(() => vi.restoreAllMocks());

  it('invalid: a 401 becomes an Exception and the log names the request but not the password', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(HttpService, 'makeRequest').mockRejectedValue({
      message: 'Request failed with status code 401',
      config: { data: JSON.stringify({ identifier: 'one_learner', password: SECRET }) },
      response: { status: 401, data: { error: 'Invalid credentials' } },
    });

    const result = await loginEndpoint().callAndParse();

    expect(result.data).toBeNull();
    expect(result.error?.statusCode).toBe(401);
    expect(result.error?.message).toBe('Invalid credentials');
    const logged = everythingLogged();
    expect(logged).toContain('POST /api/auth/login');
    expect(logged).toContain('401');
    expect(logged).not.toContain(SECRET);
  });

  it('boundary: a network failure with no response is a status-0 Exception, still without the body', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(HttpService, 'makeRequest').mockRejectedValue({
      message: 'Network Error',
      config: { data: JSON.stringify({ password: SECRET }) },
    });

    const result = await loginEndpoint().callAndParse();

    expect(result.error?.statusCode).toBe(0);
    expect(everythingLogged()).not.toContain(SECRET);
  });

  it('nominal: a 2xx response is parsed and nothing is logged', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(HttpService, 'makeRequest').mockResolvedValue({ status: 200, data: { token: 't' } } as never);

    const result = await loginEndpoint().callAndParse();

    expect(result.data).toEqual({ token: 't' });
    expect(everythingLogged()).toBe('[]');
  });
});
