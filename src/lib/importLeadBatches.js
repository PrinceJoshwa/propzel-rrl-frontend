// Bound both payload size and concurrent requests for large CSV imports.
const BATCH_SIZE = 500;
const CONCURRENCY = 3;

export async function importLeadBatches({ rows, autoAssign, post, onProgress }) {
  const total = { created: 0, failed: 0, date_warnings: [], requestErrors: [] };
  let nextStart = 0;
  let completed = 0;
  async function worker() {
    while (nextStart < rows.length) {
      const start = nextStart;
      nextStart += BATCH_SIZE;
      const batch = rows.slice(start, start + BATCH_SIZE);
      try {
        const { data } = await post('/leads/import', {
          rows: batch, auto_assign: autoAssign,
        }, { timeout: 75000 });
        total.created += data.created || 0;
        total.failed += data.failed || 0;
        total.date_warnings.push(...(data.date_warnings || []));
      } catch (error) {
        // Never retry automatically: a timed-out request may have saved rows.
        total.failed += batch.length;
        total.requestErrors.push(`Rows ${start + 1}–${start + batch.length}`);
      }
      completed += batch.length;
      onProgress?.({ completed, total: rows.length });
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, Math.ceil(rows.length / BATCH_SIZE)) }, worker));
  return total;
}
