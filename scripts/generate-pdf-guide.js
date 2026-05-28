/**
 * Renders public/programmer-guide.html to public/RoboWar-Programmer-Guide.pdf
 * using a headless Chromium browser via Playwright.
 *
 * Run: node scripts/generate-pdf-guide.js
 * Requires the Vite dev server OR a static file server to be running, OR
 * reads the file directly via file:// URL.
 */

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlPath = resolve(__dirname, '../public/programmer-guide.html');
const pdfPath  = resolve(__dirname, '../public/RoboWar-Programmer-Guide.pdf');

(async () => {
  console.log('Launching headless browser…');
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Load via file:// so no dev server is required
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });

  // Override dark theme with a print-friendly light theme.
  // The HTML file stays dark for browser viewing; this only affects PDF output.
  await page.addStyleTag({ content: `
    :root {
      --bg:       #ffffff;
      --surface:  #f6f8fa;
      --border:   #d0d7de;
      --text:     #1f2328;
      --text-dim: #57606a;
      --accent:   #0550ae;
      --green:    #1a7f37;
      --yellow:   #7a4f00;
      --red:      #cf222e;
      --purple:   #6639ba;
      --orange:   #bc4c00;
    }
    body            { background: #fff; color: #1f2328; }
    h1              { color: #1f2328; }
    h2              { color: #0550ae; border-bottom-color: #d0d7de; }
    h3              { color: #7a4f00; }
    pre             { background: #f6f8fa; border-color: #d0d7de; }
    code            { background: #f6f8fa; color: #bc4c00; }
    table th        { background: #f6f8fa; color: #57606a; }
    td              { border-color: #d0d7de; }
    th              { border-color: #d0d7de; }
    tr:nth-child(even) td { background: #f9fbfd; }
    .note           { background: #dafbe1; border-color: #82cf96; }
    .note strong    { color: #1a7f37; }
    .warn           { background: #ffebe9; border-color: #ffa198; }
    .warn strong    { color: #cf222e; }
    .tip            { background: #ddf4ff; border-color: #80ccff; }
    .tip strong     { color: #6639ba; }
    .badge          { background: #ddf4ff; color: #0550ae; border-color: #0550ae; }
    .badge.new      { background: #dafbe1; color: #1a7f37; border-color: #1a7f37; }
    .toc a          { color: #57606a; }
    .toc a:hover    { color: #0550ae; }
    .subtitle       { color: #57606a; }
    a               { color: #0550ae; }
    pre .kw         { color: #cf222e; }
    pre .reg        { color: #0550ae; }
    pre .num        { color: #953800; }
    pre .cmt        { color: #57606a; font-style: italic; }
    pre .lbl        { color: #0550ae; }
    pre .int        { color: #7a4f00; }
    hr              { border-top-color: #d0d7de; }
    p               { color: #1f2328; }
    li              { color: #1f2328; }
    .section-anchor { color: inherit; }
  ` });

  console.log('Generating PDF…');
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,   // essential for dark background
    margin: { top: '20mm', right: '18mm', bottom: '20mm', left: '18mm' },
  });

  await browser.close();
  console.log(`PDF written to: ${pdfPath}`);
})();
