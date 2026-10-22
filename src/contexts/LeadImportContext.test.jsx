import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { LeadImportProvider, useLeadImport } from './LeadImportContext';
import { api } from '@/lib/api';

let mockOrganization = { activeOrganizationId: 'org-a', activeOrganization: { name: 'Organization A' } };
jest.mock('@/contexts/OrganizationContext', () => ({ useOrganization: () => mockOrganization }));
jest.mock('@/lib/api', () => ({ api: { post: jest.fn() }, requestErrorMessage: error => error.message }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), warning: jest.fn(), error: jest.fn() } }));

let current, root, container;
const originalReader = global.FileReader;
function Page() { current = useLeadImport(); return <div>{current.fileName}</div>; }
const render = show => root.render(<LeadImportProvider>{show ? <Page /> : <div>Another page</div>}</LeadImportProvider>);
const file = count => ({ name: 'leads.csv', text: 'name,phone\n' + Array.from({ length: count }, (_, i) => `Lead ${i},${i}`).join('\n') });
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockOrganization = { activeOrganizationId: 'org-a', activeOrganization: { name: 'Organization A' } };
  api.post.mockReset();
  global.FileReader = class { readAsText(file) { this.result = file.text; this.onload(); } };
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
  act(() => render(true));
});
afterEach(() => { act(() => root.unmount()); container.remove(); global.FileReader = originalReader; });

test('draft, running import, progress, and result survive navigating away and back', async () => {
  let finish;
  api.post.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  act(() => current.selectFile(file(2)));
  act(() => render(false)); act(() => render(true));
  expect(current.rows).toHaveLength(2);
  expect(current.fileName).toBe('leads.csv');
  let job;
  act(() => { job = current.runImport(); current.runImport(); });
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(current.busy).toBe(true);
  act(() => render(false));
  await act(async () => { finish({ data: { created: 2, failed: 0 } }); await job; });
  act(() => render(true));
  expect(current.busy).toBe(false);
  expect(current.result.created).toBe(2);
  expect(current.progress).toEqual({ completed: 2, total: 2 });
  await act(async () => { await current.runImport(); });
  expect(api.post).toHaveBeenCalledTimes(1);
});

test('changing organization does not redirect later batches or expose the previous draft', async () => {
  const pending = [];
  api.post.mockImplementation((path, body, options) => new Promise(resolve => pending.push({ body, options, resolve })));
  act(() => current.selectFile(file(2001)));
  let job;
  act(() => { job = current.runImport(); });
  expect(pending).toHaveLength(3);
  mockOrganization = { activeOrganizationId: 'org-b', activeOrganization: { name: 'Organization B' } };
  act(() => render(true));
  expect(current.rows).toHaveLength(0);
  expect(current.busy).toBe(false);
  await act(async () => { pending.slice(0, 3).forEach(p => p.resolve({ data: { created: p.body.rows.length } })); });
  expect(pending).toHaveLength(5);
  await act(async () => { pending.slice(3).forEach(p => p.resolve({ data: { created: p.body.rows.length } })); await job; });
  expect(pending.every(p => p.options.headers['X-Organization-Id'] === 'org-a')).toBe(true);
  expect(current.result).toBeNull();
  mockOrganization = { activeOrganizationId: 'org-a', activeOrganization: { name: 'Organization A' } };
  act(() => render(true));
  expect(current.result.created).toBe(2001);
});

test('ending the authenticated session stops scheduling unsent batches', async () => {
  const pending = [];
  api.post.mockImplementation((path, body, options) => new Promise(resolve => pending.push({ body, options, resolve })));
  act(() => current.selectFile(file(2001)));
  let job;
  act(() => { job = current.runImport(); });
  act(() => root.render(<div>Signed out</div>));
  expect(pending.every(p => p.options.signal.aborted)).toBe(true);
  await act(async () => { pending.forEach(p => p.resolve({ data: { created: p.body.rows.length } })); await job; });
  expect(api.post).toHaveBeenCalledTimes(3);
});
