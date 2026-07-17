// 엑셀(.xlsx)/CSV 명단 파서 — 외부 의존성 없이 zip 중앙 디렉터리 + DecompressionStream 사용
// (legacy/index.v1.html의 검증된 구현을 TS로 이관)

async function readZipEntries(u8: Uint8Array): Promise<Map<string, Uint8Array>> {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 22 - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('올바른 xlsx(zip) 파일이 아닙니다');
  const count = dv.getUint16(eocd + 10, true);
  let off = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out = new Map<string, Uint8Array>();
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(off, true) !== 0x02014b50) break;
    const method = dv.getUint16(off + 10, true);
    const csize = dv.getUint32(off + 20, true);
    const nlen = dv.getUint16(off + 28, true);
    const elen = dv.getUint16(off + 30, true);
    const clen = dv.getUint16(off + 32, true);
    const lho = dv.getUint32(off + 42, true);
    const name = dec.decode(u8.subarray(off + 46, off + 46 + nlen));
    off += 46 + nlen + elen + clen;
    if (!/sharedStrings\.xml$|worksheets\/sheet\d+\.xml$/.test(name)) continue;
    const lnlen = dv.getUint16(lho + 26, true);
    const lelen = dv.getUint16(lho + 28, true);
    const start = lho + 30 + lnlen + lelen;
    const comp = u8.subarray(start, start + csize);
    if (method === 0) {
      out.set(name, comp);
    } else {
      const stream = new Blob([comp as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      out.set(name, new Uint8Array(await new Response(stream).arrayBuffer()));
    }
  }
  return out;
}

export async function parseXlsx(buf: ArrayBuffer): Promise<string[][]> {
  const entries = await readZipEntries(new Uint8Array(buf));
  const dec = new TextDecoder();
  const parser = new DOMParser();
  const shared: string[] = [];
  const ss = entries.get('xl/sharedStrings.xml');
  if (ss) {
    const doc = parser.parseFromString(dec.decode(ss), 'application/xml');
    for (const si of Array.from(doc.getElementsByTagName('si'))) {
      shared.push(Array.from(si.getElementsByTagName('t')).map((t) => t.textContent ?? '').join(''));
    }
  }
  const sheetName = [...entries.keys()].filter((n) => n.startsWith('xl/worksheets/')).sort()[0];
  if (!sheetName) throw new Error('시트를 찾을 수 없습니다');
  const doc = parser.parseFromString(dec.decode(entries.get(sheetName)!), 'application/xml');
  const rows: string[][] = [];
  for (const row of Array.from(doc.getElementsByTagName('row'))) {
    const cells: string[] = [];
    for (const c of Array.from(row.getElementsByTagName('c'))) {
      let col = 0;
      for (const ch of c.getAttribute('r') || '') {
        const code = ch.charCodeAt(0);
        if (code >= 65 && code <= 90) col = col * 26 + code - 64;
        else break;
      }
      const colIdx = col > 0 ? col - 1 : cells.length;
      let val = '';
      if (c.getAttribute('t') === 'inlineStr') {
        val = c.textContent ?? '';
      } else {
        const v = c.getElementsByTagName('v')[0];
        val = v?.textContent ?? '';
        if (c.getAttribute('t') === 's' && val !== '') val = shared[+val] ?? '';
      }
      cells[colIdx] = String(val).trim();
    }
    rows.push(Array.from(cells, (x) => x ?? ''));
  }
  return rows;
}

export function parseDelimited(text: string): string[][] {
  return text.split(/\r?\n/).map((line) => line.split(/\t|,/).map((c) => c.trim()));
}

export interface RosterEntry {
  name: string;
  dept: string;
  sno: string;
}

/** 헤더(성명/학번/소속) 자동 인식, 헤더 없으면 한글 이름 패턴 열 추정. 동명이인은 (n) 접미사 */
export function extractPeople(rows: string[][]): RosterEntry[] {
  const clean = rows.filter((r) => r.some((c) => c));
  if (!clean.length) return [];
  const header = clean[0].map((c) => String(c || ''));
  let nameCol = header.findIndex((h) => /성명|이름|name/i.test(h));
  let deptCol = header.findIndex((h) => /소속|학과|전공|부서/i.test(h));
  let snoCol = header.findIndex((h) => /학번|사번|student/i.test(h));
  let dataRows: string[][];
  if (nameCol >= 0) {
    dataRows = clean.slice(1);
  } else {
    const width = Math.max(...clean.map((r) => r.length));
    let best = 0;
    let bestScore = -1;
    for (let c = 0; c < width; c++) {
      const score = clean.filter((r) => /^[가-힣]{2,4}$/.test(r[c] || '')).length;
      if (score > bestScore) { bestScore = score; best = c; }
    }
    nameCol = best;
    deptCol = -1;
    snoCol = -1;
    dataRows = /연번|번호|no\.?|이메일|캠퍼스/i.test(header.join(' ')) ? clean.slice(1) : clean;
  }
  const seen = new Map<string, number>();
  const out: RosterEntry[] = [];
  for (const r of dataRows) {
    let name = (r[nameCol] || '').trim();
    if (!name) continue;
    const k = seen.get(name) || 0;
    seen.set(name, k + 1);
    if (k > 0) name = `${name}(${k + 1})`;
    out.push({
      name,
      dept: deptCol >= 0 ? (r[deptCol] || '').trim() : '',
      sno: snoCol >= 0 ? (r[snoCol] || '').trim() : '',
    });
  }
  return out;
}

/** 파일 확장자에 따라 xlsx/구분자 파싱 후 명단 추출 */
export async function parseRosterFile(file: File): Promise<RosterEntry[]> {
  if (/\.(xlsx|xls)$/i.test(file.name)) {
    return extractPeople(await parseXlsx(await file.arrayBuffer()));
  }
  return extractPeople(parseDelimited(await file.text()));
}
