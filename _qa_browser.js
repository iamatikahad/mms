// Browser QA audit — visits every page as each role across viewports/themes/langs.
// Detects: console errors, page errors, horizontal overflow, blank pages.
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = 'http://localhost:4001';
const OUT = 'qa_screenshots';
fs.mkdirSync(OUT, { recursive: true });

const ROLES = {
  superadmin: { user: 'superadmin', pass: 'admin123', pages: [
    '/admin','/admin/members','/admin/meals','/admin/meal-requests','/admin/guests','/admin/bazar',
    '/admin/deposits','/admin/expenses','/admin/bills','/admin/reports','/admin/chat','/admin/polls',
    '/admin/flowchart','/admin/closing','/admin/notifications','/admin/messes','/admin/admins',
    '/admin/audit','/admin/settings','/admin/profile'] },
  messadmin: { user: 'e2e_admin2', pass: 'e2e_admin2_pass', pages: [
    '/admin','/admin/members','/admin/meals','/admin/meal-requests','/admin/guests','/admin/bazar',
    '/admin/deposits','/admin/expenses','/admin/bills','/admin/reports','/admin/chat','/admin/polls',
    '/admin/flowchart','/admin/closing','/admin/notifications','/admin/profile'] },
  member: { user: 'e2e_member2', pass: 'e2e_member2_pass', pages: [
    '/member','/member/meals','/member/chat','/member/polls','/member/expenses','/member/reports',
    '/member/notifications','/member/profile'] },
};

const VIEWPORTS = { desktop: { width: 1440, height: 900 }, laptop: { width: 1366, height: 768 }, tablet: { width: 768, height: 1024 }, mobile: { width: 375, height: 812 } };

async function login(user, pass) {
  const r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: user, password: pass }) });
  const sc = r.headers.get('set-cookie') || '';
  const tok = sc.split(';')[0];
  return tok;
}

(async () => {
  const browser = await chromium.launch();
  const report = [];
  for (const [role, cfg] of Object.entries(ROLES)) {
    const cookie = await login(cfg.user, cfg.pass);
    if (!cookie.includes('mess_token')) { console.log('LOGIN FAIL', role); continue; }
    // desktop full matrix: light+dark × en+bn on dashboard only; all pages en dark desktop; mobile en dark all pages
    const combos = [
      { vp: 'desktop', theme: 'dark', lang: 'en', pages: cfg.pages },
      { vp: 'desktop', theme: 'light', lang: 'en', pages: ['/admin','/admin/members','/admin/reports','/admin/settings','/member','/member/reports'] },
      { vp: 'desktop', theme: 'dark', lang: 'bn', pages: ['/admin','/admin/members','/admin/reports','/admin/settings','/member','/member/reports'] },
      { vp: 'mobile', theme: 'dark', lang: 'en', pages: cfg.pages },
      { vp: 'tablet', theme: 'dark', lang: 'en', pages: ['/admin','/admin/reports','/admin/chat','/member','/member/reports'] },
      { vp: 'laptop', theme: 'light', lang: 'bn', pages: ['/admin','/admin/reports'] },
    ];
    for (const combo of combos) {
      const ctx = await browser.newContext({ viewport: VIEWPORTS[combo.vp] });
      await ctx.addCookies([{ name: 'mess_token', value: cookie.split('=')[1], domain: 'localhost', path: '/' }]);
      const page = await ctx.newPage();
      const errors = [];
      page.on('console', m => { if (m.type() === 'error') errors.push('console:' + m.text().slice(0, 160)); });
      page.on('pageerror', e => errors.push('pageerror:' + String(e).slice(0, 160)));
      // set prefs before app scripts run
      await page.addInitScript(([th, lg]) => {
        localStorage.setItem('theme', th); localStorage.setItem('i18nextLng', lg); localStorage.setItem('language', lg);
      }, [combo.theme, combo.lang]);
      for (const p of combo.pages) {
        errors.length = 0;
        try {
          await page.goto(BASE + p, { waitUntil: 'networkidle', timeout: 20000 });
          await page.waitForTimeout(600);
          const info = await page.evaluate(() => ({
            title: document.title,
            hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
            bodyText: document.body.innerText.slice(0, 200),
            blank: document.body.innerText.trim().length < 20,
          }));
          const shot = `${OUT}/${role}_${combo.vp}_${combo.theme}_${combo.lang}_${p.replace(/\//g, '_')}.png`;
          await page.screenshot({ path: shot, fullPage: false });
          const rec = { role, vp: combo.vp, theme: combo.theme, lang: combo.lang, page: p, hScroll: info.hScroll, blank: info.blank, errors: [...errors], shot };
          report.push(rec);
          if (info.hScroll || info.blank || errors.length) console.log('ISSUE', JSON.stringify(rec));
        } catch (e) {
          report.push({ role, vp: combo.vp, theme: combo.theme, lang: combo.lang, page: p, navError: String(e).slice(0, 120) });
          console.log('NAVFAIL', role, combo.vp, p, String(e).slice(0, 80));
        }
      }
      await ctx.close();
    }
  }
  fs.writeFileSync('qa_report.json', JSON.stringify(report, null, 1));
  const issues = report.filter(r => r.hScroll || r.blank || (r.errors && r.errors.length) || r.navError);
  console.log('\n==== TOTAL VISITS:', report.length, 'ISSUES:', issues.length, '====');
  issues.slice(0, 40).forEach(i => console.log(JSON.stringify(i).slice(0, 300)));
  await browser.close();
})();
