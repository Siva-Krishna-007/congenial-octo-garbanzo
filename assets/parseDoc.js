/* Parses an uploaded .docx or .pdf entirely in the browser.
   Uses mammoth.js for docx and pdf.js for pdf. */

if (window['pdfjsLib']) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
}

async function parseUploadedFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.docx')) {
    return parseDocx(file);
  } else if (name.endsWith('.pdf')) {
    return parsePdf(file);
  } else {
    throw new Error('Unsupported file type. Please upload a .docx or .pdf file.');
  }
}

async function parseDocx(file) {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value.trim();
}

async function parsePdf(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(it => it.str).join(' ');
    text += pageText + '\n\n';
  }
  return text.trim();
}
