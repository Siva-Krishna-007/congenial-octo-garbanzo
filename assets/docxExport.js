/* Builds a genuine .docx (real OOXML, via the docx npm package's browser
   UMD build -- window.docx, loaded the same way pdfmake already is) from
   the live #proposalPreview/#sowPreview/#drdPreview DOM. Replaces the old
   "HTML wrapped with Word namespaces, saved as .doc" trick: that approach
   had no way to produce an actual repeating header/footer region (Word
   just treated everything as one flowing body), which is why logos and
   the header band rendered as ordinary top-of-page-1 content with extra
   spacing instead of behaving like a real Word header. This version
   builds an actual header1.xml/footer1.xml part with real page-number
   fields, so it repeats correctly on every page. */

const DX = {
  green: '1F6B2E',
  orange: 'C55A11',
  greenTint: 'EAF4EC',
  orangeTint: 'FBEEE3',
  grey: 'F2F2F2',
  ink: '1A1A1A',
  white: 'FFFFFF',
  line: 'E3E3E3'
};

function dxRun(text, opts = {}) {
  return new docx.TextRun(Object.assign({ text: text || '', color: DX.ink, size: 21 }, opts)); // size is half-points: 21 = 10.5pt
}

function dxPara(text, opts = {}) {
  const { runOpts, ...paraOpts } = opts;
  return new docx.Paragraph(Object.assign({
    children: [dxRun(text, runOpts || {})],
    spacing: { after: 160 }
  }, paraOpts));
}

function dxHeadingPara(el) {
  const tag = el.tagName.toLowerCase();
  const text = el.textContent.trim();
  if (tag === 'h1') return new docx.Paragraph({ children: [dxRun(text, { bold: true, color: DX.green, size: 44 })], spacing: { after: 80 } });
  if (tag === 'h2') return new docx.Paragraph({ children: [dxRun(text, { color: DX.orange, size: 26 })], spacing: { after: 320 } });
  if (tag === 'h3') return new docx.Paragraph({
    children: [dxRun(text, { bold: true, color: DX.green, size: 28 })],
    spacing: { before: 400, after: 160 },
    border: { bottom: { color: DX.greenTint, space: 4, style: docx.BorderStyle.SINGLE, size: 6 } }
  });
  return new docx.Paragraph({ children: [dxRun(text, { bold: true, color: DX.orange, size: 23 })], spacing: { before: 280, after: 120 } });
}

const noBorder = { style: docx.BorderStyle.NONE, size: 0, color: DX.white };
const allNoBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };
const thinBorder = { style: docx.BorderStyle.SINGLE, size: 4, color: DX.line };
const allThinBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

function dxCellsOf(row, selector) {
  return Array.from(row.querySelectorAll(selector)).map(td => td.textContent.trim());
}

// Two-column key/value table (client/company meta info, acceptance block).
function dxMetaTable(el) {
  const rows = Array.from(el.querySelectorAll('tr')).map(r => {
    const k = r.querySelector('td.k, th');
    const v = k ? k.nextElementSibling : r.querySelectorAll('td')[1];
    return [k ? k.textContent.trim() : '', v ? v.textContent.trim() : ''];
  });
  return new docx.Table({
    width: { size: 100, type: docx.WidthType.PERCENTAGE },
    borders: { ...allThinBorders, insideHorizontal: thinBorder, insideVertical: thinBorder },
    rows: rows.map(([k, v], i) => new docx.TableRow({
      children: [
        new docx.TableCell({
          width: { size: 35, type: docx.WidthType.PERCENTAGE },
          shading: { fill: DX.green },
          margin: { top: 100, bottom: 100, left: 140, right: 140 },
          children: [dxPara(k, { runOpts: { bold: true, color: DX.white, size: 20 }, spacing: { after: 0 } })]
        }),
        new docx.TableCell({
          shading: { fill: i % 2 === 1 ? DX.grey : DX.white },
          margin: { top: 100, bottom: 100, left: 140, right: 140 },
          children: [dxPara(v, { runOpts: { size: 20 }, spacing: { after: 0 } })]
        })
      ]
    }))
  });
}

// General data table with a green header row (Investment, Timeline, etc).
function dxDataTable(el) {
  const headerCells = dxCellsOf(el.querySelector('tr'), 'th');
  const bodyRows = Array.from(el.querySelectorAll('tr')).slice(headerCells.length ? 1 : 0).map(r => dxCellsOf(r, 'td'));
  const colCount = headerCells.length || (bodyRows[0] || []).length || 1;
  const mkCell = (text, { header, shade } = {}) => new docx.TableCell({
    shading: { fill: header ? DX.green : (shade ? DX.grey : DX.white) },
    margin: { top: 90, bottom: 90, left: 120, right: 120 },
    children: [dxPara(text, { runOpts: { bold: !!header, color: header ? DX.white : DX.ink, size: 19 }, spacing: { after: 0 } })]
  });
  const rows = [];
  if (headerCells.length) rows.push(new docx.TableRow({ children: headerCells.map(t => mkCell(t, { header: true })) }));
  bodyRows.forEach((r, i) => {
    const cells = [];
    for (let c = 0; c < colCount; c++) cells.push(mkCell(r[c] || '', { shade: i % 2 === 1 }));
    rows.push(new docx.TableRow({ children: cells }));
  });
  return new docx.Table({ width: { size: 100, type: docx.WidthType.PERCENTAGE }, borders: { ...allThinBorders, insideHorizontal: thinBorder, insideVertical: thinBorder }, rows });
}

// SOW's merged group-header bar (e.g. "A. Organisation Setup & Configuration").
function dxGroupHeader(el) {
  const text = (el.querySelector('td') || el).textContent.trim();
  return new docx.Table({
    width: { size: 100, type: docx.WidthType.PERCENTAGE },
    borders: allNoBorders,
    rows: [new docx.TableRow({ children: [new docx.TableCell({
      shading: { fill: DX.green },
      margin: { top: 120, bottom: 120, left: 140, right: 140 },
      children: [dxPara(text, { runOpts: { bold: true, color: DX.white, size: 21 }, spacing: { after: 0 } })]
    })] })]
  });
}

// SOW's numbered items table (no header row, first column is the number).
function dxItemsTable(el) {
  const rows = Array.from(el.querySelectorAll('tr'));
  return new docx.Table({
    width: { size: 100, type: docx.WidthType.PERCENTAGE },
    borders: { ...allThinBorders, insideHorizontal: thinBorder, insideVertical: thinBorder },
    rows: rows.map((r, i) => {
      const cells = dxCellsOf(r, 'td, th');
      const shade = i % 2 === 1 ? DX.grey : DX.white;
      return new docx.TableRow({
        children: [
          new docx.TableCell({ width: { size: 6, type: docx.WidthType.PERCENTAGE }, shading: { fill: shade }, margin: { top: 80, bottom: 80, left: 100, right: 100 }, children: [dxPara(cells[0] || '', { runOpts: { size: 18 }, alignment: docx.AlignmentType.CENTER, spacing: { after: 0 } })] }),
          new docx.TableCell({ shading: { fill: shade }, margin: { top: 80, bottom: 80, left: 100, right: 100 }, children: [dxPara(cells[1] || '', { runOpts: { size: 18 }, spacing: { after: 0 } })] })
        ]
      });
    })
  });
}

function dxCallout(el) {
  const isOrange = el.classList.contains('orange');
  const bEl = el.querySelector('b');
  const spanEl = el.querySelector('span');
  const heading = bEl ? bEl.textContent.trim() : '';
  const body = spanEl ? spanEl.textContent.trim() : el.textContent.trim();
  const children = [];
  if (heading) children.push(dxPara(heading, { runOpts: { bold: true, color: isOrange ? DX.orange : DX.green, size: 19 }, spacing: { after: 60 } }));
  if (body) children.push(dxPara(body, { runOpts: { italics: !heading, size: 19 }, spacing: { after: 0 } }));
  return new docx.Table({
    width: { size: 100, type: docx.WidthType.PERCENTAGE },
    borders: { top: noBorder, right: noBorder, bottom: noBorder, left: { style: docx.BorderStyle.SINGLE, size: 24, color: isOrange ? DX.orange : DX.green } },
    rows: [new docx.TableRow({ children: [new docx.TableCell({
      shading: { fill: isOrange ? DX.orangeTint : DX.greenTint },
      margin: { top: 140, bottom: 140, left: 200, right: 200 },
      children
    })] })]
  });
}

function dxList(el, ordered) {
  return Array.from(el.querySelectorAll('li')).map(li => new docx.Paragraph({
    children: [dxRun(li.textContent.trim(), { size: 20 })],
    bullet: ordered ? undefined : { level: 0 },
    numbering: ordered ? { reference: 'dx-num', level: 0 } : undefined,
    spacing: { after: 80 }
  }));
}

// Walks the same top-level DOM structure as pdfExport.js's domToPdfContent,
// producing docx.js content elements instead of pdfMake nodes. The
// header/footer bands and logo row are deliberately skipped here too --
// they become the real Header/Footer objects instead (see below).
function domToDocxContent(root) {
  const content = [];
  Array.from(root.children).forEach(node => {
    const tag = node.tagName.toLowerCase();
    const cls = node.classList;
    if (tag === 'table' && (cls.contains('doc-header-band') || cls.contains('doc-footer-band') || cls.contains('doc-logo-row'))) return;
    if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4') { content.push(dxHeadingPara(node)); return; }
    if (tag === 'p') {
      const text = node.textContent.trim();
      if (text) content.push(dxPara(text, { runOpts: { size: 20, italics: node.querySelector('i') && node.children.length === 1 } }));
      return;
    }
    if (tag === 'table' && cls.contains('meta-table')) { content.push(dxMetaTable(node)); content.push(new docx.Paragraph({ text: '' })); return; }
    if (tag === 'table' && cls.contains('group-header')) { content.push(dxGroupHeader(node)); return; }
    if (tag === 'table' && cls.contains('items')) { content.push(dxItemsTable(node)); content.push(new docx.Paragraph({ text: '' })); return; }
    if (tag === 'table' && cls.contains('data')) { content.push(dxDataTable(node)); content.push(new docx.Paragraph({ text: '' })); return; }
    if (tag === 'div' && cls.contains('callout')) { content.push(dxCallout(node)); content.push(new docx.Paragraph({ text: '' })); return; }
    if (tag === 'ul') { content.push(...dxList(node, false)); return; }
    if (tag === 'ol') { content.push(...dxList(node, true)); return; }
  });
  return content;
}

function dxHeaderFooter(source) {
  const headerBandEl = source.querySelector('.doc-header-band');
  const footerBandEl = source.querySelector('.doc-footer-band');
  const logoRowEl = source.querySelector('.doc-logo-row');
  const clientLogoImg = logoRowEl ? logoRowEl.querySelector('.doc-logo-left img') : null;
  const companyLogoImg = logoRowEl ? logoRowEl.querySelector('.doc-logo-right img') : null;
  const headerLeftEl = headerBandEl ? headerBandEl.querySelector('.doc-header-left') : null;
  const headerRightEl = headerBandEl ? headerBandEl.querySelector('.doc-header-right') : null;
  const headerLeftParts = headerLeftEl ? headerLeftEl.textContent.split('|').map(s => s.trim()) : ['', ''];
  const footerLeftEl = footerBandEl ? footerBandEl.querySelector('td:first-child') : null;

  const dataUriToBuffer = uri => {
    const b64 = (uri || '').split(',')[1] || '';
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  };

  const headerChildren = [];
  if (clientLogoImg || companyLogoImg) {
    const logoCell = img => {
      if (!img) return new docx.TableCell({ borders: allNoBorders, children: [new docx.Paragraph({ text: '' })] });
      const wPx = Number(img.getAttribute('width')) || 90;
      const hPx = Number(img.getAttribute('height')) || Math.round(wPx * 0.65);
      return new docx.TableCell({
        borders: allNoBorders,
        children: [new docx.Paragraph({
          alignment: img.closest('.doc-logo-left') ? docx.AlignmentType.LEFT : docx.AlignmentType.RIGHT,
          children: [new docx.ImageRun({ data: dataUriToBuffer(img.getAttribute('src')), transformation: { width: wPx, height: hPx }, type: 'png' })]
        })]
      });
    };
    headerChildren.push(new docx.Table({
      width: { size: 100, type: docx.WidthType.PERCENTAGE },
      borders: { ...allNoBorders, insideHorizontal: noBorder, insideVertical: noBorder },
      rows: [new docx.TableRow({ children: [logoCell(clientLogoImg), logoCell(companyLogoImg)] })]
    }));
  }
  if (headerBandEl) {
    headerChildren.push(new docx.Table({
      width: { size: 100, type: docx.WidthType.PERCENTAGE },
      borders: { top: noBorder, left: noBorder, right: noBorder, bottom: { style: docx.BorderStyle.SINGLE, size: 12, color: DX.green }, insideHorizontal: noBorder, insideVertical: noBorder },
      rows: [new docx.TableRow({ children: [
        new docx.TableCell({ borders: allNoBorders, margin: { bottom: 80 }, children: [new docx.Paragraph({ children: [
          dxRun((headerLeftParts[0] || '') + '  ', { bold: true, color: DX.green, size: 17 }),
          dxRun(headerLeftParts[1] || '', { size: 17 })
        ] })] }),
        new docx.TableCell({ borders: allNoBorders, margin: { bottom: 80 }, children: [new docx.Paragraph({ alignment: docx.AlignmentType.RIGHT, children: [dxRun(headerRightEl ? headerRightEl.textContent.trim() : '', { bold: true, size: 22 })] })] })
      ] })]
    }));
  }
  headerChildren.push(new docx.Paragraph({ text: '' }));

  const footerChildren = footerBandEl ? [
    new docx.Table({
      width: { size: 100, type: docx.WidthType.PERCENTAGE },
      borders: { bottom: noBorder, left: noBorder, right: noBorder, top: { style: docx.BorderStyle.SINGLE, size: 12, color: DX.green }, insideHorizontal: noBorder, insideVertical: noBorder },
      rows: [new docx.TableRow({ children: [
        new docx.TableCell({ borders: allNoBorders, margin: { top: 80 }, children: [new docx.Paragraph({ children: [dxRun(footerLeftEl ? footerLeftEl.textContent.trim() : '', { italics: true, size: 16, color: '888888' })] })] }),
        new docx.TableCell({ borders: allNoBorders, margin: { top: 80 }, children: [new docx.Paragraph({
          alignment: docx.AlignmentType.RIGHT,
          children: [dxRun('Page ', { size: 18 }), new docx.TextRun({ children: [docx.PageNumber.CURRENT], size: 18 })]
        })] })
      ] })]
    })
  ] : [new docx.Paragraph({ alignment: docx.AlignmentType.RIGHT, children: [new docx.TextRun({ children: [docx.PageNumber.CURRENT], color: DX.green, bold: true, size: 18 })] })];

  return {
    headers: { default: new docx.Header({ children: headerChildren }) },
    footers: { default: new docx.Footer({ children: footerChildren }) }
  };
}

async function buildDocxAndDownload(elementId, docLabel, filenameSuffix) {
  elementId = elementId || 'proposalPreview';
  docLabel = docLabel || 'Proposal';
  filenameSuffix = filenameSuffix || 'Proposal';
  const el = document.getElementById(elementId);
  if (!el || !el.innerHTML.trim()) throw new Error(`Generate the ${docLabel.toLowerCase()} first.`);
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  if (typeof docx === 'undefined') throw new Error('The Word export library did not load — check your internet connection and try again.');

  const { headers, footers } = dxHeaderFooter(el);
  const content = domToDocxContent(el);

  const doc = new docx.Document({
    numbering: { config: [{ reference: 'dx-num', levels: [{ level: 0, format: docx.LevelFormat.DECIMAL, text: '%1.', alignment: docx.AlignmentType.START }] }] },
    sections: [{
      properties: { page: { margin: { top: 1400, bottom: 1000, left: 1000, right: 1000 } } },
      headers, footers,
      children: content
    }]
  });

  const blob = await docx.Packer.toBlob(doc);
  const filename = (STATE.client.clientCompany || docLabel).replace(/[^a-z0-9]+/gi, '_') + '_' + filenameSuffix + '.docx';
  saveAs(blob, filename);
}
