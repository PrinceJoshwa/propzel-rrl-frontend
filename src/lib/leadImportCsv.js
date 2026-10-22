export function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
  if (!lines.length) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
  return lines.slice(1).map(line => {
    const cells = [];
    let cell = '', quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        if (quoted && line[i + 1] === '"') { cell += '"'; i += 1; }
        else quoted = !quoted;
      } else if (char === ',' && !quoted) { cells.push(cell); cell = ''; }
      else cell += char;
    }
    cells.push(cell);
    return Object.fromEntries(headers.map((h, i) => [h, (cells[i] || '').trim()]));
  });
}

const value = (row, ...names) => names.map(name => row[name]).find(v => v != null && String(v).trim()) || '';
export function toImportRows(rows) {
  return rows.map(r => ({
    name: value(r, 'name', 'user_name'),
    phone: value(r, 'phone', 'phone_number', 'phone number', 'mobile', 'mobile_number') || null,
    email: value(r, 'email', 'email_id') || null,
    lead_date: value(r, 'lead_date', 'date', 'created_date', 'created at') || null,
    source: r.source || 'manual', project_name: r.project_name || null,
    budget_min: r.budget_min ? Number(r.budget_min) : null,
    budget_max: r.budget_max ? Number(r.budget_max) : null,
    configuration: value(r, 'configuration', 'property_types') || null,
    location_pref: value(r, 'location_pref', 'location_enquired') || null,
    notes: [r.notes, r.city_name ? `City: ${r.city_name}` : null].filter(Boolean).join('; ') || null,
  })).filter(r => r.name);
}
