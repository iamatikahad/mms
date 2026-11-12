const oracledb = require('./backend/node_modules/oracledb');
const fs = require('fs');
const env = {};
fs.readFileSync('backend/.env', 'utf8').split(/\r?\n/).forEach(l => { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2]; });
(async () => {
  const c = await oracledb.getConnection({ user: env.DB_USER, password: env.DB_PASSWORD, connectString: env.DB_CONNECT_STRING });
  for (const t of ['MESSAGES', 'CONVERSATIONS', 'CONVERSATION_PARTICIPANTS', 'MESSAGE_DELETED_FOR', 'MESSAGE_REACTIONS', 'MESSAGE_RECEIPTS', 'UPLOADED_FILES']) {
    try {
      const r = await c.execute(`SELECT column_name, data_type, nullable FROM user_tab_columns WHERE table_name='${t}' ORDER BY column_id`, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
      console.log('\n' + t + ':\n  ' + r.rows.map(x => x.COLUMN_NAME + ':' + x.DATA_TYPE + (x.NULLABLE === 'N' ? '*' : '')).join('\n  '));
    } catch (e) { console.log(t + ': ERR ' + e.message); }
  }
  await c.close();
})();
