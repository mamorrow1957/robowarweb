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
