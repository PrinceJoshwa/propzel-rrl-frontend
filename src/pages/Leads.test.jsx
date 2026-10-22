import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import Leads from './Leads';
import { api } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  api: { get: jest.fn() }, asArray: data => Array.isArray(data) ? data : data?.items || [],
  formatApiError: String, requestErrorMessage: error => error.message,
  STAGE_META: [{ key: 'new', label: 'New', tone: '#102A20' }], SOURCE_LABEL: {}, inr: String, relTime: () => '',
}));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { role: 'super_admin' } }) }));
jest.mock('@/contexts/ProjectContext', () => ({ useProjects: () => ({ activeId: '__all__' }) }));
jest.mock('@/contexts/OrganizationContext', () => ({ useOrganization: () => ({ activeOrganizationId: 'test-org', activeOrganization: { id: 'test-org' }, loading: false }) }));
jest.mock('@/contexts/LeadImportContext', () => ({ useLeadImport: () => ({ busy: false, revision: 0 }) }));
jest.mock('@/pages/DataImport', () => () => <div>Import form</div>);
jest.mock('react-router-dom', () => ({ Link: ({ children }) => <span>{children}</span>, useSearchParams: () => [new URLSearchParams(), jest.fn()] }), { virtual: true });
jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }) => <div>{children}</div>, DialogContent: () => null, DialogTrigger: ({ children }) => children,
  DialogHeader: ({ children }) => <div>{children}</div>, DialogTitle: ({ children }) => <div>{children}</div>, DialogFooter: ({ children }) => <div>{children}</div>,
}));
jest.mock('@/components/ui/select', () => ({
  Select: ({ children }) => <div>{children}</div>, SelectContent: () => null, SelectItem: () => null,
  SelectTrigger: ({ children }) => <div>{children}</div>, SelectValue: () => null,
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

let root, container;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers(); api.get.mockReset();
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.useRealTimers(); });
const mount = async () => { await act(async () => { root.render(<Leads />); }); await act(async () => { jest.advanceTimersByTime(200); }); };

test('shows true total and next page even if auxiliary filter requests fail', async () => {
  api.get.mockImplementation(async (path, options) => {
    if (path !== '/leads') throw new Error('Filter service unavailable');
    return { data: { items: [{ id: `page-${options.params.page}`, name: 'Lead', stage: 'new' }], total: 26922 } };
  });
  await mount();
  expect(container.textContent).toContain('26,922 leads in view');
  expect(container.textContent).toContain('Showing 1–100 of 26,922 leads');
  expect(container.textContent).toContain('Page 1 of 270');
  expect(container.textContent).toContain('Import CSV');
  const next = [...container.querySelectorAll('button')].find(button => button.textContent === 'Next');
  expect(next.disabled).toBe(false);
  await act(async () => { next.click(); });
  await act(async () => { jest.advanceTimersByTime(200); });
  expect(api.get.mock.calls.filter(([path]) => path === '/leads').at(-1)[1].params.page).toBe(2);
  expect(container.textContent).toContain('Showing 101–200 of 26,922 leads');
});

test('failed lead requests show a retryable error instead of claiming there are zero leads', async () => {
  api.get.mockImplementation(async path => {
    if (path === '/leads') throw new Error('Server failed');
    return { data: [] };
  });
  await mount();
  expect(container.textContent).toContain('Leads unavailable');
  expect(container.querySelector('[role="alert"]').textContent).toContain('Server failed');
  expect(container.textContent).not.toContain('0 leads in view');
});

test('returning to the page reloads the saved leads', async () => {
  api.get.mockImplementation(async path => ({ data: path === '/leads' ? { items: [{ id: 'saved', name: 'Saved lead', stage: 'new' }], total: 26922 } : [] }));
  await mount();
  await act(async () => { root.render(<div>Another page</div>); });
  await mount();
  expect(container.textContent).toContain('Saved lead');
  expect(container.textContent).toContain('26,922 leads in view');
  expect(api.get.mock.calls.filter(([path]) => path === '/leads')).toHaveLength(2);
});
