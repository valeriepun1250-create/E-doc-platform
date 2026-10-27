const PAGE_WIDTH = 620;
const PAGE_HEIGHT = 877;
const SCALE = 2;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const encoder = new TextEncoder();

function pdfBytes(pages) {
  const chunks = [];
  const offsets = [0];
  let length = 0;
  const append = bytes => {
    chunks.push(bytes);
    length += bytes.length;
  };
  const write = value => append(encoder.encode(value));
  const object = (number, body) => {
    offsets[number] = length;
    write(`${number} 0 obj\n${body}\nendobj\n`);
  };

  write('%PDF-1.4\n');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, `<< /Type /Pages /Kids [${pages.map((_, index) => `${index * 3 + 3} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  pages.forEach((canvas, index) => {
    const pageNumber = index * 3 + 3;
    const dataUrl = canvas.toDataURL('image/jpeg', 0.86);
    const binary = atob(dataUrl.split(',')[1]);
    const image = Uint8Array.from(binary, char => char.charCodeAt(0));
    const content = `q\n595 0 0 842 0 0 cm\n/Im0 Do\nQ\n`;
    object(pageNumber, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 ${pageNumber + 1} 0 R >> >> /Contents ${pageNumber + 2} 0 R >>`);
    offsets[pageNumber + 1] = length;
    write(`${pageNumber + 1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`);
    append(image);
    write('\nendstream\nendobj\n');
    object(pageNumber + 2, `<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream`);
  });
  const startXref = length;
  write(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
  offsets.slice(1).forEach(offset => write(`${String(offset).padStart(10, '0')} 00000 n \n`));
  write(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF`);
  return new Blob(chunks, { type: 'application/pdf' });
}

function reportPages(report) {
  const pages = [];
  let canvas;
  let ctx;
  let y;
  const newPage = () => {
    canvas = document.createElement('canvas');
    canvas.width = PAGE_WIDTH * SCALE;
    canvas.height = PAGE_HEIGHT * SCALE;
    ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is unavailable.');
    ctx.scale(SCALE, SCALE);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
    ctx.textBaseline = 'top';
    y = MARGIN;
    pages.push(canvas);
  };
  const font = (size, weight = 400) => {
    ctx.font = `${weight} ${size}px Arial, sans-serif`;
  };
  const wrap = text => {
    const result = [];
    let line = '';
    for (const word of String(text).split(/(\s+)/).filter(Boolean)) {
      const next = line + word;
      if (ctx.measureText(next).width <= CONTENT_WIDTH) {
        line = next;
        continue;
      }
      if (line.trim()) result.push(line.trimEnd());
      line = word.trimStart();
      while (ctx.measureText(line).width > CONTENT_WIDTH) {
        let cut = 1;
        while (cut < line.length && ctx.measureText(line.slice(0, cut + 1)).width <= CONTENT_WIDTH) cut++;
        result.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    result.push(line.trimEnd());
    return result;
  };
  const drawLine = (line, size, height, weight = 400, color = '#1e293b') => {
    if (y + height > PAGE_HEIGHT - MARGIN) newPage();
    font(size, weight);
    ctx.fillStyle = color;
    ctx.fillText(line, MARGIN, y);
    y += height;
  };
  const drawText = (value, size, height, weight, color) => {
    font(size, weight);
    String(value || '').replace(/\r\n?/g, '\n').split('\n').forEach(paragraph => {
      if (!paragraph) {
        y += height * 0.55;
        return;
      }
      wrap(paragraph).forEach(line => drawLine(line, size, height, weight, color));
    });
  };

  newPage();
  drawText('Assessment Report', 21, 29, 700, '#173b34');
  drawText(report.name || 'Untitled case', 17, 24, 700, '#17231f');
  drawText([report.formTitle, report.date].filter(Boolean).join('  |  '), 11, 19, 400, '#52645e');
  y += 17;

  report.sections.forEach(section => {
    const text = String(section.text || '');
    if (!text.trim()) return;
    if (y + 58 > PAGE_HEIGHT - MARGIN) newPage();
    ctx.strokeStyle = '#cfdcd6';
    ctx.beginPath();
    ctx.moveTo(MARGIN, y);
    ctx.lineTo(PAGE_WIDTH - MARGIN, y);
    ctx.stroke();
    y += 13;
    drawText(section.title, 14, 22, 700, '#175b45');
    y += 5;
    drawText(text, 12, 18, 400, '#1e293b');
    y += 20;
  });

  pages.forEach((page, index) => {
    const context = page.getContext('2d');
    context.font = '11px Arial, sans-serif';
    context.fillStyle = '#65736d';
    context.textBaseline = 'top';
    context.fillText(`${index + 1} / ${pages.length}`, PAGE_WIDTH - MARGIN - 34, PAGE_HEIGHT - 34);
  });
  return pages;
}

export function downloadAssessmentPdf(report) {
  if (!Array.isArray(report.sections)) throw new Error('Report content is unavailable.');
  const blob = pdfBytes(reportPages(report));
  const name = String(report.name || 'assessment').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '').slice(0, 70) || 'assessment';
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name}-assessment.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
