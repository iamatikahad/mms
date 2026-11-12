// Full logical backup: every table -> JSON (restorable). CLOBs via DBMS_LOB.SUBSTR.
const oracledb = require('./backend/node_modules/oracledb');
const fs = require('fs');
const path = require('path');
const env = {};
fs.readFileSync('backend/.env', 'utf8').split(/\r?\n/).forEach(l => { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2]; });
const OUT = path.join(__dirname, 'backups', `db_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
(async () => {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const c = await oracledb.getConnection({ user: env.DB_USER, password: env.DB_PASSWORD, connectString: env.DB_CONNECT_STRING });
  const tabs = await c.execute(`SELECT table_name FROM user_tables ORDER BY table_name`, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
  const dump = { createdAt: new Date().toISOString(), tables: {} };
  for (const t of tabs.rows) {
    const tn = t.TABLE_NAME;
    const cols = await c.execute(`SELECT column_name, data_type FROM user_tab_columns WHERE table_name=:1 ORDER BY column_id`, [tn], { outFormat: oracledb.OUT_FORMAT_OBJECT });
    const sel = cols.rows.map(x => {
      const n = x.COLUMN_NAME;
      return /CLOB|NCLOB|BLOB/.test(x.DATA_TYPE) ? `DBMS_LOB.SUBSTR("${n}",4000,1) "${n}"` : `"${n}"`;
    }).join(',');
    const r = await c.execute(`SELECT ${sel} FROM "${tn}"`, [], { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchArraySize: 1000 });
    dump.tables[tn] = r.rows.map(row => {
      const o = {};
      for (const k of Object.keys(row)) {
        let v = row[k];
        if (v instanceof Date) v = v.toISOString();
        else if (v && typeof v === 'object' && v.getData) v = null;
        o[k] = v;
      }
      return o;
    });
    console.log(tn, dump.tables[tn].length);
  }
  fs.writeFileSync(OUT, JSON.stringify(dump));
  console.log('BACKUP WRITTEN:', OUT, fs.statSync(OUT).size, 'bytes');
  // verify readable
  const chk = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  console.log('VERIFY: tables=', Object.keys(chk.tables).length, 'users=', chk.tables.USERS?.length, 'members=', chk.tables.MEMBERS?.length);
  await c.close();
})();
