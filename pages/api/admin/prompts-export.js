// Every style and its prompt as an Excel workbook. Host-only.
import ExcelJS from 'exceljs';
import { isAdminRequest } from '../../../lib/auth';
import { getHiddenPresets, getPromptOverrides, getGlobalSamples } from '../../../lib/store';
import { PRESETS, presetSummaries, defaultPromptTemplate } from '../../../lib/presets';

function needsLabel(needs) {
  if (needs.includes('backdrop')) return "Guest's photo + a portrait to pose with";
  if (needs.includes('references')) return "Guest's photo + reference photos";
  if (needs.includes('selfie')) return "Guest's photo + a selfie";
  return "Guest's photo";
}

export default async function handler(req, res) {
  if (!isAdminRequest(req)) return res.status(401).json({ error: 'Not signed in' });
  if (req.method !== 'GET') return res.status(405).end();

  const [hidden, overrides, samples] = await Promise.all([
    getHiddenPresets(),
    getPromptOverrides(),
    getGlobalSamples(),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Moment Share';
  wb.created = new Date();
  const ws = wb.addWorksheet('Styles', { views: [{ state: 'frozen', ySplit: 1 }] });

  ws.columns = [
    { header: 'Style', key: 'label', width: 24 },
    { header: 'Description', key: 'blurb', width: 30 },
    { header: 'Status', key: 'status', width: 11 },
    { header: 'Uses', key: 'uses', width: 22 },
    { header: 'Prompt in use', key: 'prompt', width: 90 },
    { header: 'Edited?', key: 'edited', width: 9 },
    { header: 'Built-in prompt (if edited)', key: 'builtIn', width: 90 },
    { header: 'Sample image', key: 'sample', width: 18 },
    { header: 'Style ID', key: 'id', width: 18 },
  ];

  for (const p of presetSummaries({})) {
    const builtIn = defaultPromptTemplate(p.id);
    const edited = Boolean(overrides[p.id]);
    const sampleUrl = samples.previews?.[p.id] || null;
    ws.addRow({
      label: p.label,
      blurb: p.blurb,
      status: hidden.includes(p.id) ? 'Removed' : 'In app',
      uses: needsLabel(PRESETS[p.id].needs),
      prompt: edited ? overrides[p.id] : builtIn,
      edited: edited ? 'Yes' : 'No',
      builtIn: edited ? builtIn : '',
      sample: sampleUrl ? { text: 'Open image', hyperlink: sampleUrl } : '',
      id: p.id,
    });
  }

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F6F63' } };
  header.alignment = { vertical: 'middle' };
  header.height = 22;
  ws.eachRow((row, n) => {
    if (n === 1) return;
    row.alignment = { vertical: 'top', wrapText: true };
    const link = row.getCell('sample');
    if (link.value && link.value.hyperlink) link.font = { color: { argb: 'FF1F5FBF' }, underline: true };
    if (row.getCell('status').value === 'Removed') row.font = { color: { argb: 'FF888888' } };
  });
  ws.autoFilter = { from: 'A1', to: 'I1' };

  const notes = wb.addWorksheet('Read me');
  notes.columns = [{ width: 110 }];
  [
    'Moment Share style prompts',
    `Exported ${new Date().toISOString().slice(0, 10)}`,
    '',
    'Placeholders in prompts are filled in for each event:',
    '  {subject}  →  who the event is for, e.g. "the couple" or "Mai"',
    '  {keepsake_text}  →  the keepsake frame text',
    '',
    'To change a prompt, edit it in the Style library (Prompt button). Editing this file does not change the app.',
  ].forEach((line, i) => {
    const cell = notes.getCell(`A${i + 1}`);
    cell.value = line;
    if (i === 0) cell.font = { bold: true, size: 14 };
  });

  const buffer = await wb.xlsx.writeBuffer();
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="moment-share-prompts-${date}.xlsx"`);
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(Buffer.from(buffer));
}
