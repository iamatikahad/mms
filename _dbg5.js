process.chdir(require('path').join(__dirname, 'backend'));
const { q1, q } = require('./backend/dist/db.js');
(async () => {
  const m = await q1(`SELECT MESSAGE_ID, DBMS_LOB.SUBSTR(BODY,100,1) B, EDITED_AT, DELETED_AT FROM MESSAGES ORDER BY MESSAGE_ID DESC FETCH FIRST 1 ROWS ONLY`);
  console.log('before:', JSON.stringify(m));
  await q(`UPDATE MESSAGES SET BODY=:2, EDITED_AT=SYSTIMESTAMP WHERE MESSAGE_ID=:1`, [m.MESSAGE_ID, 'direct update test']);
  const m2 = await q1(`SELECT MESSAGE_ID, DBMS_LOB.SUBSTR(BODY,100,1) B, EDITED_AT, DELETED_AT FROM MESSAGES WHERE MESSAGE_ID=:1`, [m.MESSAGE_ID]);
  console.log('after:', JSON.stringify(m2));
  process.exit(0);
})();
