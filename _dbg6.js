const oracledb = require('./backend/node_modules/oracledb');
const fs = require('fs');
const env = {};
fs.readFileSync('backend/.env', 'utf8').split(/\r?\n/).forEach(l => { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2]; });
(async () => {
  const c = await oracledb.getConnection({ user: env.DB_USER, password: env.DB_PASSWORD, connectString: env.DB_CONNECT_STRING });
  const r = await c.execute(`UPDATE MESSAGES SET BODY=:1, EDITED_AT=SYSTIMESTAMP WHERE MESSAGE_ID=:2`, ['dbg6 ' + Date.now(), 21], { outFormat: oracledb.OUT_FORMAT_OBJECT });
  console.log('rowCount:', r.rowsAffected);
  await c.commit();
  const s = await c.execute(`SELECT DBMS_LOB.SUBSTR(BODY,60,1) B, EDITED_AT FROM MESSAGES WHERE MESSAGE_ID=21`, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
  console.log(JSON.stringify(s.rows[0]));
  await c.close();
})();
