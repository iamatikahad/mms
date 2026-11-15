const oracledb = require('./backend/node_modules/oracledb');
const fs = require('fs');
const env = {};
fs.readFileSync('backend/.env', 'utf8').split(/\r?\n/).forEach(l => { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2]; });
(async () => {
  const c = await oracledb.getConnection({ user: env.DB_USER, password: env.DB_PASSWORD, connectString: env.DB_CONNECT_STRING });
  const stmts = [
    `CREATE TABLE CHAT_THEME_PREFS (USER_ID NUMBER NOT NULL PRIMARY KEY, THEME_KEY VARCHAR2(40) DEFAULT 'whatsapp', CUSTOM_JSON CLOB, CONV_OVERRIDES CLOB, UPDATED_AT TIMESTAMP DEFAULT SYSTIMESTAMP)`,
    `CREATE TABLE CHAT_MUTES (USER_ID NUMBER NOT NULL, CONVERSATION_ID NUMBER NOT NULL, MUTED NUMBER(1) DEFAULT 1, UPDATED_AT TIMESTAMP DEFAULT SYSTIMESTAMP, PRIMARY KEY (USER_ID, CONVERSATION_ID))`,
    `CREATE INDEX IDX_CHAT_MUTES_CONV ON CHAT_MUTES(CONVERSATION_ID)`,
  ];
  for (const s of stmts) {
    try { await c.execute(s); await c.commit(); console.log('OK:', s.slice(0, 60)); }
    catch (e) { console.log('SKIP/ERR:', e.message.slice(0, 80)); }
  }
  await c.close();
})();
