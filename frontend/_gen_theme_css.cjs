const fs = require('fs');
const src = fs.readFileSync('src/themes.ts', 'utf8');
const re = /key: '([^']+)'[\s\S]*?light: T\(([^)]*)\),\s*dark: T\(([^)]*)\)/g;
let m;
let out = '\n/* theme variable definitions (generated) */\n';
const names = ['bg','bg2','card','input','border','text','text2','accent','accent2','onAccent'];
const cssNames = { bg:'bg', bg2:'bg2', card:'card', input:'input', border:'border', text:'text', text2:'text2', accent:'accent', accent2:'accent2', onAccent:'on-accent' };
while ((m = re.exec(src))) {
  const key = m[1];
  const grab = s => (s.match(/'[^']*'|#[0-9a-fA-F]{3,8}/g) || []).map(x => x.replace(/^'|'$/g, ''));
  const light = grab(m[2]), dark = grab(m[3]);
  const emit = (sel, vals) => {
    out += sel + '{';
    names.forEach((v, i) => { out += '--ui-' + cssNames[v] + ':' + (vals[i] || '#888') + ';'; });
    out += '}\n';
  };
  emit('html[data-theme=' + key + ']', light);
  emit('html[data-theme=' + key + '].dark', dark);
}
fs.appendFileSync('src/index.css', out);
console.log('appended', out.length, 'bytes');
