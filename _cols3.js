const oracledb = require('./backend/node_modules/oracledb');
const fs = require('fs');
const env = {};
fs.readFileSync('backend/.env', 'utf8').split(/\r?\n/).forEach(l => { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2]; });
(async () => {
  const c = await oracledb.getConnection({ user: env.DB_USER, password: env.DB_PASSWORD, connectString: env.DB_CONNECT_STRING });
  const r = await c.execute(`SELECT table_name FROM user_tables WHERE table_name LIKE 'CHAT%' OR table_name LIKE '%CONVERSATION%' OR table_name LIKE '%POLL%' OR table_name LIKE '%NOTIF%' OR table_name LIKE '%REMINDER%' ORDER BY table_name`, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
  console.log(r.rows.map(x => x.TABLE_NAME).join('\n'));
  const r2 = await c.execute(`SELECT COUNT(*) C FROM CHAT_CONVERSATIONS`, [], { outFormat: oracledb.OUT_FORMAT_OBJECT }).catch(e => ({ rows: [{ C: 'ERR:' + e.message }] }));
  console.log('conv count:', r2.rows[0].C);
  await c.close();
})();
