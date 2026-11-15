const oracledb = require('./backend/node_modules/oracledb');
const fs = require('fs');
const env = {};
fs.readFileSync('backend/.env', 'utf8').split(/\r?\n/).forEach(l => { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2]; });
(async () => {
  const c = await oracledb.getConnection({ user: env.DB_USER, password: env.DB_PASSWORD, connectString: env.DB_CONNECT_STRING });
  const r = await c.execute(`SELECT FILE_ID, ORIGINAL_NAME, MIME_TYPE, UPLOADED_BY FROM UPLOADED_FILES ORDER BY FILE_ID`, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
  console.log(JSON.stringify(r.rows, null, 0));
  const m = await c.execute(`SELECT USER_ID, PROFILE_IMAGE_FILE_ID FROM MEMBERS WHERE PROFILE_IMAGE_FILE_ID IS NOT NULL`, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
  console.log('profile refs:', JSON.stringify(m.rows));
  await c.close();
})();
