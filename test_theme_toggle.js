const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({headless: true, args: ['--no-sandbox']});
  const page = await browser.newPage();
  await page.setViewport({width: 1280, height: 800});
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));

  await page.goto('http://localhost:8080', {waitUntil: 'networkidle0', timeout: 15000});
  await page.waitForTimeout(1500);

  const initialTheme = await page.evaluate(() => document.body.dataset.theme || 'dark');
  await page.click('#theme-toggle');
  await page.waitForTimeout(600);
  const afterToggle = await page.evaluate(() => ({
    theme: document.body.dataset.theme || 'dark',
    btnLight: document.getElementById('theme-toggle').classList.contains('is-light')
  }));

  await page.click('#theme-toggle');
  await page.waitForTimeout(600);
  const backTheme = await page.evaluate(() => document.body.dataset.theme || 'dark');

  console.log('Initial theme:', initialTheme);
  console.log('After toggle:', afterToggle);
  console.log('Back theme:', backTheme);
  console.log('Errors:', errors.length ? errors : 'none');

  await browser.close();
})();
