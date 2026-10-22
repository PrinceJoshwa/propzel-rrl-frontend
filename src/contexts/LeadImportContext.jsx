import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { api, requestErrorMessage } from '@/lib/api';
import { useOrganization } from '@/contexts/OrganizationContext';
import { importLeadBatches } from '@/lib/importLeadBatches';
import { parseCsv, toImportRows } from '@/lib/leadImportCsv';
import { toast } from 'sonner';

const Context = createContext(null);
const emptyDraft = () => ({ rows: [], fileName: '', autoAssign: true, busy: false, result: null, progress: null, revision: 0 });

export function LeadImportProvider({ children }) {
  const { activeOrganizationId, activeOrganization } = useOrganization();
  const [drafts, setDrafts] = useState({});
  const controllers = useRef(new Map());
  const key = activeOrganizationId || '';
  const state = drafts[key] || emptyDraft();
  const update = (org, patch) => setDrafts(prev => ({ ...prev, [org]: { ...(prev[org] || emptyDraft()), ...patch } }));
  const runningJobs = Object.values(drafts).filter(draft => draft.busy);

  useEffect(() => {
    const current = controllers.current;
    return () => { current.forEach(controller => controller.abort()); current.clear(); };
  }, []);
  useEffect(() => {
    if (!runningJobs.length) return;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [runningJobs.length]);

  const selectFile = file => {
    if (!file || controllers.current.has(key)) return;
    update(key, { fileName: file.name, rows: [], result: null, progress: null });
    const reader = new FileReader();
    reader.onload = () => update(key, { rows: parseCsv(String(reader.result)) });
    reader.onerror = () => toast.error('Could not read the CSV file. Please select it again.');
    reader.readAsText(file);
  };
  const runImport = async () => {
    if (!key) { toast.error('Select an organisation before importing leads.'); return; }
    if (controllers.current.has(key)) return;
    if (state.result) { toast.error('This file has already been processed. Select a file again to start a new import.'); return; }
    const rows = toImportRows(state.rows);
    if (!rows.length) { toast.error('No names found. Use a name or User_Name column.'); return; }
    const controller = new AbortController();
    controllers.current.set(key, controller);
    update(key, { busy: true, result: null, progress: { completed: 0, total: rows.length }, organizationId: key, organizationName: activeOrganization?.name || 'Selected organisation' });
    try {
      const total = await importLeadBatches({ rows, autoAssign: state.autoAssign, signal: controller.signal,
        // Keep the destination fixed if the user switches organisations mid-import.
        post: (path, body, options) => api.post(path, body, { ...options, signal: controller.signal, headers: { 'X-Organization-Id': key } }),
        onProgress: progress => update(key, { progress }),
      });
      if (controller.signal.aborted) return;
      update(key, { result: total, revision: state.revision + 1 });
      if (total.requestErrors.length) toast.warning(`Imported ${total.created} leads. ${total.failed} rows need review before retrying.`);
      else toast.success(`Imported ${total.created} leads (${total.failed} skipped)`);
    } catch (error) {
      if (!controller.signal.aborted) toast.error(requestErrorMessage(error));
    } finally {
      controllers.current.delete(key);
      if (!controller.signal.aborted) update(key, { busy: false });
    }
  };
  return <Context.Provider value={{ ...state, selectFile, runImport, setAutoAssign: autoAssign => update(key, { autoAssign }), runningJobs }}>{children}</Context.Provider>;
}

export const useLeadImport = () => useContext(Context);
