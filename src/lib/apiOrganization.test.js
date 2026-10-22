import { AxiosError } from 'axios';
import { api, setAuthTokens } from './api';
jest.mock('axios', () => jest.requireActual('../../node_modules/axios/dist/node/axios.cjs'));
const respond = (config, data = {}, status = 200) => ({ config, data, status, statusText: 'OK', headers: {} });
beforeEach(() => { localStorage.clear(); setAuthTokens({ access_token: 'old', refresh_token: 'refresh' }); });
afterEach(() => { localStorage.clear(); });

test('a background import keeps its organization when the active selection changes', async () => {
  localStorage.setItem('propzel.activeOrganizationId', 'org-b');
  api.defaults.adapter = jest.fn(async config => respond(config, { organization: config.headers['X-Organization-Id'] }));
  const response = await api.post('/leads/import', { rows: [] }, { headers: { 'X-Organization-Id': 'org-a' } });
  expect(response.data.organization).toBe('org-a');
});

test('token refresh preserves the original request organization', async () => {
  localStorage.setItem('propzel.activeOrganizationId', 'org-b');
  api.defaults.adapter = jest.fn(async config => {
    if (config.url === '/auth/refresh') return respond(config, { access_token: 'new' });
    if (config.headers.Authorization === 'Bearer old') throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, {}, respond(config, {}, 401));
    return respond(config, { organization: config.headers['X-Organization-Id'] });
  });
  const response = await api.get('/leads', { headers: { 'X-Organization-Id': 'org-a' } });
  expect(response.data.organization).toBe('org-a');
});
