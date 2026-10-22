import { importLeadBatches } from './importLeadBatches';

test('26,922 leads use 54 requests, at most three in flight, with no lost or repeated rows', async () => {
  const rows = Array.from({ length: 26922 }, (_, id) => ({ name: `Lead ${id}`, id }));
  let active = 0, peak = 0;
  const received = [];
  const post = jest.fn(async (path, body) => {
    expect(path).toBe('/leads/import');
    expect(body.auto_assign).toBe(false);
    active += 1;
    peak = Math.max(peak, active);
    received.push(...body.rows);
    await new Promise(resolve => setTimeout(resolve, 0));
    active -= 1;
    return { data: { created: body.rows.length, failed: 0 } };
  });
  const onProgress = jest.fn();
  const total = await importLeadBatches({ rows, autoAssign: false, post, onProgress });
  expect(post).toHaveBeenCalledTimes(54);
  expect(peak).toBe(3);
  expect(received).toEqual(rows);
  expect(new Set(received.map(row => row.id)).size).toBe(rows.length);
  expect(total).toEqual({ created: 26922, failed: 0, date_warnings: [], requestErrors: [] });
  expect(onProgress).toHaveBeenLastCalledWith({ completed: 26922, total: 26922 });
});

test('failed requests are counted without retrying or blocking the remaining rows', async () => {
  const rows = Array.from({ length: 1201 }, (_, id) => ({ id }));
  const post = jest.fn(async (_, body) => {
    if (body.rows[0].id === 500) throw new Error('timeout');
    return { data: { created: body.rows.length, failed: 0, date_warnings: ['date warning'] } };
  });
  const total = await importLeadBatches({ rows, autoAssign: true, post });
  expect(post).toHaveBeenCalledTimes(3);
  expect(total.created).toBe(701);
  expect(total.failed).toBe(500);
  expect(total.date_warnings).toHaveLength(2);
  expect(total.requestErrors).toEqual(['Rows 501–1000']);
});

test('an empty import never reports work or sends a request', async () => {
  const post = jest.fn();
  const total = await importLeadBatches({ rows: [], post });
  expect(post).not.toHaveBeenCalled();
  expect(total.created).toBe(0);
});
