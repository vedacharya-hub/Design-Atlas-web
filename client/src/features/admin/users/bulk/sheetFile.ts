/* Reads and writes the Upload Users sheet without a spreadsheet library. An .xlsx file is a zip of
   XML parts: reading inflates the parts with the browser's DecompressionStream and takes the first
   worksheet; writing stores the parts uncompressed. Plain .csv files are read too. */

export type SheetRows = string[][];

// ---------- zip ----------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function concat(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** A zip with every file stored as is (no compression): small, and simple to write. */
function zip(files: { name: string; text: string }[]) {
  const encoder = new TextEncoder();
  const body: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  let offset = 0;
  // 1 Jan 1980, the earliest date a zip can hold.
  const DOS_DATE = (1 << 5) | 1;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.text);
    const crc = crc32(data);

    const local = new Uint8Array(30 + name.length);
    const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true);
    l.setUint16(6, 0x0800, true); // UTF-8 names
    l.setUint16(12, DOS_DATE, true);
    l.setUint32(14, crc, true);
    l.setUint32(18, data.length, true);
    l.setUint32(22, data.length, true);
    l.setUint16(26, name.length, true);
    local.set(name, 30);

    const entry = new Uint8Array(46 + name.length);
    const e = new DataView(entry.buffer);
    e.setUint32(0, 0x02014b50, true);
    e.setUint16(4, 20, true);
    e.setUint16(6, 20, true);
    e.setUint16(8, 0x0800, true);
    e.setUint16(14, DOS_DATE, true);
    e.setUint32(16, crc, true);
    e.setUint32(20, data.length, true);
    e.setUint32(24, data.length, true);
    e.setUint16(28, name.length, true);
    e.setUint32(42, offset, true);
    entry.set(name, 46);

    body.push(local, data);
    directory.push(entry);
    offset += local.length + data.length;
  }
  const size = directory.reduce((n, d) => n + d.length, 0);
  const end = new Uint8Array(22);
  const v = new DataView(end.buffer);
  v.setUint32(0, 0x06054b50, true);
  v.setUint16(8, files.length, true);
  v.setUint16(10, files.length, true);
  v.setUint32(12, size, true);
  v.setUint32(16, offset, true);
  return concat([...body, ...directory, end]);
}

async function inflate(data: Uint8Array) {
  const stream = new Blob([data.slice()]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The zip's files by name, each read on demand. */
function unzip(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new SheetError('This file isn’t a readable Excel sheet. Save it as .xlsx or .csv and try again.');
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  const files = new Map<string, () => Promise<Uint8Array>>();
  for (let i = 0; i < count; i++) {
    if (view.getUint32(at, true) !== 0x02014b50) break;
    const method = view.getUint16(at + 10, true);
    const compressed = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    files.set(name, async () => {
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const data = bytes.subarray(start, start + compressed);
      if (method === 0) return data;
      if (method === 8) return inflate(data);
      throw new SheetError('This sheet is saved in a format we can’t read. Save it as .xlsx or .csv and try again.');
    });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

// ---------- reading ----------
/** A problem with the file itself, worded for the admin. */
export class SheetError extends Error {}

const parseXml = (text: string) => new DOMParser().parseFromString(text, 'application/xml');

/** "B12" → column 1. */
function columnIndex(ref: string) {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.toUpperCase().charCodeAt(0) - 64);
  return n - 1;
}

/** A cell's text: the <t> runs inside it, leaving out phonetic guides. */
function runs(el: Element) {
  return [...el.getElementsByTagName('t')]
    .filter((t) => t.parentElement?.tagName !== 'rPh')
    .map((t) => t.textContent ?? '')
    .join('');
}

async function readXlsx(buffer: ArrayBuffer): Promise<SheetRows> {
  const files = unzip(buffer);
  const text = async (name: string) => {
    const read = files.get(name);
    return read ? new TextDecoder().decode(await read()) : null;
  };

  // The first sheet in the workbook (not necessarily sheet1.xml).
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const [workbook, rels] = await Promise.all([text('xl/workbook.xml'), text('xl/_rels/workbook.xml.rels')]);
  if (workbook && rels) {
    const id = parseXml(workbook).getElementsByTagName('sheet')[0]?.getAttribute('r:id');
    const target = [...parseXml(rels).getElementsByTagName('Relationship')].find((r) => r.getAttribute('Id') === id)?.getAttribute('Target');
    if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
  }
  const sheet = await text(sheetPath);
  if (!sheet) throw new SheetError('We couldn’t find a sheet in this file.');
  const sharedXml = await text('xl/sharedStrings.xml');
  const shared = sharedXml ? [...parseXml(sharedXml).getElementsByTagName('si')].map(runs) : [];

  const rows: SheetRows = [];
  [...parseXml(sheet).getElementsByTagName('row')].forEach((rowEl, i) => {
    const r = Number(rowEl.getAttribute('r')) - 1;
    const row: string[] = [];
    let next = 0;
    for (const c of [...rowEl.getElementsByTagName('c')]) {
      const ref = c.getAttribute('r');
      const col = ref ? columnIndex(ref) : next;
      next = col + 1;
      const type = c.getAttribute('t');
      const v = c.getElementsByTagName('v')[0]?.textContent ?? '';
      row[col] = type === 's' ? shared[Number(v)] ?? '' : type === 'inlineStr' ? runs(c) : type === 'b' ? (v === '1' ? 'TRUE' : 'FALSE') : v;
    }
    rows[Number.isFinite(r) && r >= 0 ? r : i] = Array.from(row, (cell) => (cell ?? '').trim());
  });
  return Array.from(rows, (row) => row ?? []);
}

function readCsv(text: string): SheetRows {
  const rows: SheetRows = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch !== '"') cell += ch;
      else if (src[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) rows.push([...row, cell.trim()]);
  return rows;
}

export const SHEET_ACCEPT = '.xlsx,.csv';

/** The first sheet of an .xlsx file, or a .csv file, as rows of trimmed text. */
export async function readSheetFile(file: File): Promise<SheetRows> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv')) return readCsv(await file.text());
  if (name.endsWith('.xlsx')) return readXlsx(await file.arrayBuffer());
  if (name.endsWith('.xls')) throw new SheetError('Older .xls sheets can’t be read. Save it as .xlsx and try again.');
  throw new SheetError('Upload an Excel sheet (.xlsx) or a .csv file.');
}

// ---------- writing ----------
export interface SheetSpec {
  name: string;
  rows: SheetRows;
  /** Column widths in characters. */
  widths?: number[];
  /** Dropdowns: the cells (e.g. "C2:C1000") and either the choices or a range on another sheet. */
  lists?: { cells: string; choices?: string[]; range?: string }[];
}

const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const columnName = (i: number): string => (i >= 26 ? columnName(Math.floor(i / 26) - 1) : '') + String.fromCharCode(65 + (i % 26));
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

function worksheet(spec: SheetSpec) {
  const cols = spec.widths?.length
    ? `<cols>${spec.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const data = spec.rows
    .map(
      (row, r) =>
        `<row r="${r + 1}">${row
          .map((v, c) => (v ? `<c r="${columnName(c)}${r + 1}" t="inlineStr"${r === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${escapeXml(v)}</t></is></c>` : ''))
          .join('')}</row>`,
    )
    .join('');
  const lists = spec.lists?.length
    ? `<dataValidations count="${spec.lists.length}">${spec.lists
        .map(
          (l) =>
            `<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="${l.cells}"><formula1>${escapeXml(
              l.range ?? `"${(l.choices ?? []).join(',')}"`,
            )}</formula1></dataValidation>`,
        )
        .join('')}</dataValidations>`
    : '';
  return `${XML}<worksheet xmlns="${MAIN_NS}" xmlns:r="${REL_NS}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${data}</sheetData>${lists}</worksheet>`;
}

/** An .xlsx workbook: a bold, shaded, frozen header row on each sheet, and optional dropdowns. */
export function buildXlsx(sheets: SheetSpec[]): Blob {
  const files = [
    {
      name: '[Content_Types].xml',
      text: `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets
        .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
        .join('')}</Types>`,
    },
    {
      name: '_rels/.rels',
      text: `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      text: `${XML}<workbook xmlns="${MAIN_NS}" xmlns:r="${REL_NS}"><sheets>${sheets
        .map((s, i) => `<sheet name="${escapeXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join('')}</sheets></workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      text: `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
        .map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL_NS}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
        .join('')}<Relationship Id="rId${sheets.length + 1}" Type="${REL_NS}/styles" Target="styles.xml"/></Relationships>`,
    },
    {
      name: 'xl/styles.xml',
      text: `${XML}<styleSheet xmlns="${MAIN_NS}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEEF2F6"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, text: worksheet(s) })),
  ];
  return new Blob([zip(files).slice()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/** Saves a file in the browser. */
export function saveFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
