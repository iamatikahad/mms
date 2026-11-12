process.chdir(require('path').join(__dirname, 'backend'));
const { q1, q, tx } = require('./backend/dist/db.js');
(async () => {
  // check latest message
  const m = await q1(`SELECT MESSAGE_ID, BODY, EDITED_AT, DELETED_AT FROM MESSAGES ORDER BY MESSAGE_ID DESC FETCH FIRST 1 ROWS ONLY`);
  console.log('before:', JSON.stringify(m));
  await q(`UPDATE MESSAGES SET BODY=:2, EDITED_AT=SYSTIMESTAMP WHERE MESSAGE_ID=:1`, [m.MESSAGE_ID, 'direct update test']);
  const m2 = await q1(`SELECT MESSAGE_ID, BODY, EDITED_AT, DELETED_AT FROM MESSAGES WHERE MESSAGE_ID=:1`, [m.MESSAGE_ID]);
  console.log('after q():', JSON.stringify(m2));
  // now test CLOB bind explicitly
  try {
    await q(`UPDATE MESSAGES SET BODY=:1 WHERE MESSAGE_ID=:2`, ['clob test ' + Date.now(), m.MESSAGE_ID]);
    const m3 = await q1(`SELECT DBMS_LOB.SUBSTR(BODY,100,1) B FROM MESSAGES WHERE MESSAGE_ID=:1`, [m.MESSAGE_ID]);
    console.log('clob after:', JSON.stringify(m3));
  } catch (e) { console.log('clob update ERR:', e.message); }
  process.exit(0);
})();
