export function csvCell(value) {
  const string = String(value ?? '');
  return /[;"\r\n]/.test(string) ? `"${string.replace(/"/g, '""')}"` : string;
}

export function toCsv(rows) {
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(';')).join('\r\n') + '\r\n';
}

export function parseCsv(text) {
  const source = String(text).replace(/^\uFEFF/, '');
  const delimiter = source.split(/\r?\n/, 1)[0].includes(';') ? ';' : ',';
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell === '') quoted = true;
    else if (char === delimiter) { row.push(cell); cell = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i++;
      row.push(cell); if (row.some(value => value !== '')) rows.push(row);
      row = []; cell = '';
    } else cell += char;
  }
  if (quoted) throw new Error('CSV-Datei enthält ein nicht geschlossenes Anführungszeichen.');
  if (cell || row.length) { row.push(cell); if (row.some(value => value !== '')) rows.push(row); }
  return rows;
}
