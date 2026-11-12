const oracledb = require('./backend/node_modules/oracledb');
const fs = require('fs');
const env = {};
fs.readFileSync('backend/.env', 'utf8').split(/\r?\n/).forEach(l => { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2]; });
(async () => {
  const c = await oracledb.getConnection({ user: env.DB_USER, password: env.DB_PASSWORD, connectString: env.DB_CONNECT_STRING });
  const tabs = await c.execute(`SELECT table_name FROM user_tables ORDER BY table_name`, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
  const out = {};
  for (const t of tabs.rows) {
    const tn = t.TABLE_NAME;
    try {
      const r = await c.execute(`SELECT COUNT(*) C FROM "${tn}"`, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
      out[tn] = Number(r.rows[0].C);
    } catch (e) { out[tn] = 'ERR'; }
  }
  console.log(JSON.stringify(out, null, 1));
  await c.close();
})();
