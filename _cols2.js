const oracledb = require('./backend/node_modules/oracledb');
const fs = require('fs');
const env = {};
fs.readFileSync('backend/.env', 'utf8').split(/\r?\n/).forEach(l => { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2]; });
(async () => {
  const c = await oracledb.getConnection({ user: env.DB_USER, password: env.DB_PASSWORD, connectString: env.DB_CONNECT_STRING });
  for (const t of ['CHAT_MESSAGES', 'CHAT_CONVERSATIONS', 'CHAT_CONVERSATION_MEMBERS', 'USER_NOTIFICATION_PREFS', 'CHAT_MESSAGE_DELETES', 'CHAT_REACTIONS', 'MEAL_REMINDER_LOG']) {
    try {
      const r = await c.execute(`SELECT column_name, data_type FROM user_tab_columns WHERE table_name='${t}' ORDER BY column_id`, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
      console.log(t + ': ' + (r.rows.length ? r.rows.map(x => x.COLUMN_NAME + ':' + x.DATA_TYPE).join(', ') : 'MISSING'));
    } catch (e) { console.log(t + ': ERR ' + e.message); }
  }
  const cnt = await c.execute(`SELECT COUNT(*) C FROM CHAT_CONVERSATIONS`, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
  console.log('conversations:', cnt.rows[0].C);
  await c.close();
})();
