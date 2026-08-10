/* Builds an actual downloadable PDF (no print dialog) using pdfmake, which
   lays out real vector text rather than rasterizing a screenshot — so page
   breaks land between lines, never mid-word/mid-glyph. Reads the live
   #proposalPreview DOM (same source as the Word export) so manual and AI
   edits are reflected exactly. Each heading is grouped with the content that
   immediately follows it as an "unbreakable" block, so a heading is pushed
   to the next page along with its content rather than left orphaned. */

const PM = {
  green: '#1F6B2E',
  orange: '#C55A11',
  greenTint: '#EAF4EC',
  orangeTint: '#FBEEE3',
  grey: '#F2F2F2',
  ink: '#1A1A1A'
};

function pmText(text, opts = {}) {
  return Object.assign({ text: text || '', color: PM.ink, fontSize: 10, lineHeight: 1.3, margin: [0, 0, 0, 8] }, opts);
}

function pmHeading(el) {
  const text = el.textContent.trim();
  const tag = el.tagName.toLowerCase();
  if (tag === 'h1') return pmText(text, { fontSize: 20, bold: true, color: PM.green, margin: [0, 0, 0, 4] });
  if (tag === 'h2') return pmText(text, { fontSize: 12.5, bold: false, color: PM.orange, margin: [0, 0, 0, 16] });
  if (tag === 'h3') return pmText(text, { fontSize: 13.5, bold: true, color: PM.green, margin: [0, 4, 0, 8] });
  return pmText(text, { fontSize: 11, bold: true, color: PM.orange, margin: [0, 6, 0, 6] });
}

function pmParagraph(el) {
  return pmText(el.textContent.trim(), { fontSize: 10, margin: [0, 0, 0, 8] });
}

function cellsOf(row, selector) {
  return Array.from(row.querySelectorAll(selector)).map(c => c.textContent.trim());
}

function pmMetaTable(tableEl) {
  const rows = Array.from(tableEl.querySelectorAll('tr'));
  const body = rows.map((r, i) => {
    const k = r.querySelector('td.k');
    const v = r.querySelector('td:not(.k)');
    return [
      { text: k ? k.textContent.trim() : '', color: '#FFFFFF', bold: true, fillColor: PM.green, fontSize: 9.5, margin: [4, 3, 4, 3] },
      { text: v ? v.textContent.trim() : '', color: PM.ink, fontSize: 9.5, fillColor: i % 2 === 1 ? PM.grey : '#FFFFFF', margin: [4, 3, 4, 3] }
    ];
  });
  return {
    table: { widths: [110, '*'], body },
    layout: {
      hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => '#E3E3E3', vLineColor: () => '#E3E3E3',
      paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0
    },
    margin: [0, 0, 0, 16]
  };
}

function pmDataTable(tableEl) {
  const rows = Array.from(tableEl.querySelectorAll('tr'));
  if (!rows.length) return null;
  const headerCells = cellsOf(rows[0], 'th, td');
  const bodyRows = rows.slice(1).map(r => cellsOf(r, 'td, th'));
  const n = headerCells.length;
  const widths = new Array(n).fill('*');
  const body = [
    headerCells.map(t => ({ text: t, color: '#FFFFFF', bold: true, fillColor: PM.green, fontSize: 9, margin: [4, 3, 4, 3] })),
    ...bodyRows.map((r, i) => r.map(t => ({ text: t, color: PM.ink, fontSize: 9, fillColor: i % 2 === 1 ? PM.grey : '#FFFFFF', margin: [4, 3, 4, 3] })))
  ];
  return {
    table: { headerRows: 1, widths, body, dontBreakRows: true },
    layout: {
      hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => '#E3E3E3', vLineColor: () => '#E3E3E3',
      paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0
    },
    margin: [0, 0, 0, 10]
  };
}

function pmCallout(el) {
  const isOrange = el.classList.contains('orange');
  const bEl = el.querySelector('b');
  const spanEl = el.querySelector('span');
  const heading = bEl ? bEl.textContent.trim() : '';
  const body = spanEl ? spanEl.textContent.trim() : '';
  const tint = isOrange ? PM.orangeTint : PM.greenTint;
  const bar = isOrange ? PM.orange : PM.green;
  const headingColor = isOrange ? PM.orange : PM.green;
  return {
    table: {
      widths: [4, '*'],
      body: [[
        { text: '', fillColor: bar, border: [false, false, false, false] },
        {
          stack: [
            heading ? { text: heading, bold: true, color: headingColor, fontSize: 9.5, margin: [0, 0, 0, 3] } : null,
            body ? { text: body, color: PM.ink, fontSize: 9.5 } : null
          ].filter(Boolean),
          fillColor: tint,
          border: [false, false, false, false],
          margin: [8, 8, 8, 8]
        }
      ]]
    },
    layout: 'noBorders',
    margin: [0, 6, 0, 10]
  };
}

// Walks the live document top-to-bottom, grouping each heading with the
// content that immediately follows it (until the next heading) into an
// "unbreakable" stack, so headings never get orphaned at a page break.
function pmGroupHeader(tableEl) {
  const cell = tableEl.querySelector('td');
  return {
    table: { widths: ['*'], body: [[{ text: cell ? cell.textContent.trim() : '', color: '#FFFFFF', bold: true, fontSize: 10.5, fillColor: PM.green, margin: [6, 6, 6, 6] }]] },
    layout: 'noBorders',
    margin: [0, 10, 0, 0]
  };
}

function pmItemsTable(tableEl) {
  const rows = Array.from(tableEl.querySelectorAll('tr'));
  if (!rows.length) return null;
  const body = rows.map((r, i) => {
    const cells = cellsOf(r, 'td, th');
    return [
      { text: cells[0] || '', fontSize: 9, color: PM.ink, alignment: 'center', fillColor: i % 2 === 1 ? PM.grey : '#FFFFFF', margin: [4, 3, 4, 3] },
      { text: cells[1] || '', fontSize: 9, color: PM.ink, fillColor: i % 2 === 1 ? PM.grey : '#FFFFFF', margin: [4, 3, 4, 3] }
    ];
  });
  return {
    table: { widths: [24, '*'], body },
    layout: {
      hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => '#E3E3E3', vLineColor: () => '#E3E3E3',
      paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0
    },
    margin: [0, 0, 0, 10]
  };
}

function pmList(el, ordered) {
  const items = Array.from(el.children)
    .filter(li => li.tagName.toLowerCase() === 'li')
    .map(li => li.textContent.trim())
    .filter(Boolean);
  const key = ordered ? 'ol' : 'ul';
  return { [key]: items, fontSize: 10, color: PM.ink, margin: [0, 0, 0, 8] };
}

// Recursively pulls every bit of text a pdfMake content node actually
// contains -- text/stack/ul/ol/table cells/columns -- so it can be
// compared against the source HTML's own text. This is what powers the
// coverage check below: if a future template introduces some other tag
// domToPdfContent doesn't know how to handle, that content gets silently
// dropped from the PDF (exactly what happened with <ul>/<ol> before this
// was added) -- this catches that class of bug automatically instead of
// only ever finding out from a support ticket.
function extractPdfContentText(node) {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(extractPdfContentText).join(' ');
  if (typeof node === 'object') {
    const parts = [];
    if (node.text != null) parts.push(extractPdfContentText(node.text));
    if (node.stack) parts.push(extractPdfContentText(node.stack));
    if (node.ul) parts.push(extractPdfContentText(node.ul));
    if (node.ol) parts.push(extractPdfContentText(node.ol));
    if (node.columns) parts.push(extractPdfContentText(node.columns));
    if (node.table && node.table.body) {
      node.table.body.forEach(row => row.forEach(cell => parts.push(extractPdfContentText(cell))));
    }
    return parts.join(' ');
  }
  return '';
}

// Compares the source document's own text against whatever actually made
// it into the PDF's content array, word by word (4+ letter words only --
// short/common words are too noisy for this to mean anything). Returns a
// coverage percentage and a sample of specifically what's missing, so a
// warning can point at something concrete rather than just "something's
// wrong maybe".
function verifyPdfCoverage(sourceEl, content) {
  const normalize = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter(w => w.length >= 4);
  // The header/footer bands and logo row are deliberately kept OUT of the
  // content array -- they're rendered as genuine per-page pdfMake
  // header()/footer() elements instead (see buildPdfAndDownload). They do
  // appear in the finished PDF, so comparing against them here would
  // report them as "missing" and fire a false warning on every export.
  const clone = sourceEl.cloneNode(true);
  clone.querySelectorAll('.doc-header-band, .doc-footer-band, .doc-logo-row').forEach(el => el.remove());
  const sourceWords = normalize(clone.textContent);
  if (!sourceWords.length) return { coveragePct: 100, missingSample: [], missingCount: 0, totalWords: 0 };
  const includedWords = new Set(normalize(extractPdfContentText(content)));
  const missingSample = [];
  let missingCount = 0;
  const uniqueSourceWords = new Set(sourceWords);
  uniqueSourceWords.forEach(w => {
    if (!includedWords.has(w)) {
      missingCount++;
      if (missingSample.length < 10) missingSample.push(w);
    }
  });
  const coveragePct = Math.round(((uniqueSourceWords.size - missingCount) / uniqueSourceWords.size) * 100);
  return { coveragePct, missingSample, missingCount, totalWords: uniqueSourceWords.size };
}

function domToPdfContent(root) {
  const content = [];
  let group = null;

  const flush = () => {
    if (group && group.length) content.push({ stack: group, unbreakable: true });
    group = null;
  };

  Array.from(root.children).forEach(node => {
    const tag = node.tagName.toLowerCase();
    const cls = node.classList;

    if (tag === 'h1' || tag === 'h2') {
      flush();
      content.push(pmHeading(node));
      return;
    }
    if (tag === 'table' && cls.contains('doc-logo-row')) {
      return; // becomes a genuine per-page repeating header via pdfMake's header() function instead (see buildPdfAndDownload)
    }
    // The running header/footer bands become genuine per-page headers and
    // footers via pdfMake's own header()/footer() functions instead (see
    // buildPdfAndDownload below) -- repeating correctly on every page,
    // which putting them in the regular content flow could never do.
    if (tag === 'table' && (cls.contains('doc-header-band') || cls.contains('doc-footer-band'))) {
      return;
    }
    if (tag === 'table' && cls.contains('meta-table')) {
      flush();
      content.push(pmMetaTable(node));
      return;
    }
    if (tag === 'table' && cls.contains('group-header')) {
      flush();
      group = [pmGroupHeader(node)];
      return;
    }
    if (tag === 'h3' || tag === 'h4') {
      flush();
      group = [pmHeading(node)];
      return;
    }

    let item = null;
    if (tag === 'p') item = pmParagraph(node);
    else if (tag === 'table' && cls.contains('data')) item = pmDataTable(node);
    else if (tag === 'table' && cls.contains('items')) item = pmItemsTable(node);
    else if (tag === 'div' && cls.contains('callout')) item = pmCallout(node);
    else if (tag === 'ul') item = pmList(node, false);
    else if (tag === 'ol') item = pmList(node, true);

    if (!item) return;
    if (group) group.push(item);
    else content.push(item);
  });

  flush();
  return content;
}

async function buildPdfAndDownload(elementId, docLabel, filenameSuffix) {
  elementId = elementId || 'proposalPreview';
  docLabel = docLabel || 'Proposal';
  filenameSuffix = filenameSuffix || 'Proposal';
  if (typeof pdfMake === 'undefined') {
    throw new Error('PDF library did not load (check your internet connection) — try Word (.docx) instead.');
  }
  const source = document.getElementById(elementId);
  if (!source || !source.innerHTML.trim()) throw new Error(`Generate the ${docLabel.toLowerCase()} first.`);
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();

  const content = domToPdfContent(source);
  const filename = (STATE.client.clientCompany || docLabel).replace(/[^a-z0-9]+/gi, '_') + '_' + filenameSuffix + '.pdf';

  // Automated completeness check -- catches content silently dropped by
  // domToPdfContent (e.g. a tag type it has no case for) before the PDF
  // ever reaches the person downloading it, rather than them finding out
  // by comparing page by page against the on-screen document.
  const coverage = verifyPdfCoverage(source, content);
  if (coverage.coveragePct < 97) {
    console.warn(
      `PDF content coverage check: ${coverage.coveragePct}% (${coverage.missingCount}/${coverage.totalWords} distinct words not found in the PDF). ` +
      `Sample of missing words: ${coverage.missingSample.join(', ')}`
    );
    if (typeof showToast === 'function') {
      showToast(
        `Heads up: the PDF may be missing some content (~${coverage.coveragePct}% coverage detected) — check it against the on-screen ${docLabel.toLowerCase()} before sending it, or use Word (.docx) instead, which always includes everything exactly as shown.`,
        true
      );
    }
  }

  // Pull the actual text/images out of the on-screen header/footer bands
  // (rather than hardcoding them here) so the PDF's per-page header/footer
  // always matches whatever's shown on screen -- including any edits or
  // uploaded logos.
  const headerBandEl = source.querySelector('.doc-header-band');
  const footerBandEl = source.querySelector('.doc-footer-band');
  const logoRowEl = source.querySelector('.doc-logo-row');
  const headerLeft = headerBandEl ? headerBandEl.querySelector('.doc-header-left') : null;
  const headerRight = headerBandEl ? headerBandEl.querySelector('.doc-header-right') : null;
  const footerLeft = footerBandEl ? footerBandEl.querySelector('td:first-child') : null;
  const clientLogoImg = logoRowEl ? logoRowEl.querySelector('.doc-logo-left img') : null;
  const companyLogoImg = logoRowEl ? logoRowEl.querySelector('.doc-logo-right img') : null;
  // The left header text is "TYPE | Client" with TYPE meant to render bold
  // green -- split back out on the same separator used to build it.
  const headerLeftParts = headerLeft ? headerLeft.textContent.split('|').map(s => s.trim()) : ['', ''];

  const docDefinition = {
    pageSize: 'A4',
    pageMargins: [40, logoRowEl ? 96 : 64, 40, 56],
    defaultStyle: { font: 'Roboto' },
    content,
    header: (!headerBandEl && !logoRowEl) ? undefined : function () {
      const stack = [];
      if (clientLogoImg || companyLogoImg) {
        // Use each image's own width attribute (set by logoRowHtml, in CSS
        // px) converted to PDF points, so two logos of different shapes
        // stay correctly proportioned rather than both forced to one size.
        // Each column gets width:'*' -- splitting the full page width in
        // two -- with the image nested inside so the column's own
        // alignment has room to push it to that edge. Giving the column a
        // width matching the image instead (as before) left no spare
        // room for alignment to act on, so both logos ended up packed on
        // the left regardless of the 'left'/'right' setting.
        const pdfWidth = imgEl => {
          const px = Number(imgEl.getAttribute('width')) || 90;
          return Math.round(px * 0.72); // px -> pt
        };
        stack.push({
          columns: [
            { width: '*', stack: [clientLogoImg ? { image: clientLogoImg.getAttribute('src'), width: pdfWidth(clientLogoImg), alignment: 'left' } : { text: '' }] },
            { width: '*', stack: [companyLogoImg ? { image: companyLogoImg.getAttribute('src'), width: pdfWidth(companyLogoImg), alignment: 'right' } : { text: '' }] }
          ],
          margin: [0, 14, 0, 4]
        });
      }
      if (headerBandEl) {
        stack.push({
          columns: [
            { text: [{ text: headerLeftParts[0] || '', bold: true, color: PM.green }, { text: headerLeftParts[1] ? '  |  ' + headerLeftParts[1] : '' }], fontSize: 9 },
            { text: headerRight ? headerRight.textContent.trim() : '', alignment: 'right', fontSize: 12, bold: true, color: PM.ink }
          ]
        });
        stack.push({ canvas: [{ type: 'line', x1: 0, y1: 6, x2: 515, y2: 6, lineWidth: 1.2, lineColor: PM.green }] });
      }
      return { margin: [40, clientLogoImg || companyLogoImg ? 8 : 22, 40, 0], stack };
    },
    footer: function (currentPage) {
      if (!footerBandEl) {
        return { text: 'Page No :  ' + currentPage, alignment: 'right', color: PM.green, bold: true, fontSize: 9, margin: [0, 8, 40, 0] };
      }
      return {
        margin: [40, 6, 40, 0],
        stack: [
          { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1.2, lineColor: PM.green }] },
          {
            columns: [
              { text: footerLeft ? footerLeft.textContent.trim() : '', fontSize: 8.5, italics: true, color: '#888888' },
              { text: 'Page ' + currentPage, alignment: 'right', fontSize: 10, bold: true, color: PM.ink }
            ],
            margin: [0, 6, 0, 0]
          }
        ]
      };
    }
  };

  pdfMake.createPdf(docDefinition).download(filename);
}
