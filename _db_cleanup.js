// Production cleanup: delete confirmed demo/test transactional data. Preserves all accounts/config.
const oracledb = require('./backend/node_modules/oracledb');
const fs = require('fs');
const path = require('path');
const env = {};
fs.readFileSync('backend/.env', 'utf8').split(/\r?\n/).forEach(l => { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2]; });

const report = { startedAt: new Date().toISOString(), deleted: {}, preserved: {}, errors: [] };
const cnt = async (c, t, w = '') => Number((await c.execute(`SELECT COUNT(*) C FROM "${t}" ${w}`, [], { outFormat: oracledb.OUT_FORMAT_OBJECT })).rows[0].C);

(async () => {
  const c = await oracledb.getConnection({ user: env.DB_USER, password: env.DB_PASSWORD, connectString: env.DB_CONNECT_STRING });
  const del = async (sql, label, table) => {
    try {
      const before = await cnt(c, table);
      const r = await c.execute(sql);
      await c.commit();
      report.deleted[label] = { table, before, after: await cnt(c, table) };
      console.log(`DEL ${label}: ${before} -> ${report.deleted[label].after}`);
    } catch (e) { await c.rollback(); report.errors.push(`${label}: ${e.message}`); console.log(`ERR ${label}: ${e.message}`); }
  };

  // chat children -> messages
  await del(`DELETE FROM MESSAGE_DELETED_FOR`, 'msg_deleted_for', 'MESSAGE_DELETED_FOR');
  await del(`DELETE FROM MESSAGE_REACTIONS`, 'msg_reactions', 'MESSAGE_REACTIONS');
  await del(`DELETE FROM MESSAGE_RECEIPTS`, 'msg_receipts', 'MESSAGE_RECEIPTS');
  await del(`DELETE FROM MESSAGES`, 'messages', 'MESSAGES');
  await del(`DELETE FROM CHAT_MESSAGES`, 'legacy_chat_messages', 'CHAT_MESSAGES');
  // direct conversations only (keep GROUP)
  await del(`DELETE FROM CONVERSATION_PARTICIPANTS WHERE CONVERSATION_ID IN (SELECT CONVERSATION_ID FROM CONVERSATIONS WHERE CONVERSATION_TYPE='DIRECT')`, 'direct_participants', 'CONVERSATION_PARTICIPANTS');
  await del(`DELETE FROM CONVERSATIONS WHERE CONVERSATION_TYPE='DIRECT'`, 'direct_conversations', 'CONVERSATIONS');
  // polls
  await del(`DELETE FROM POLL_VOTES`, 'poll_votes', 'POLL_VOTES');
  await del(`DELETE FROM POLL_OPTIONS`, 'poll_options', 'POLL_OPTIONS');
  await del(`DELETE FROM POLLS`, 'polls', 'POLLS');
  // notifications/reminders
  await del(`DELETE FROM NOTIFICATIONS`, 'notifications', 'NOTIFICATIONS');
  await del(`DELETE FROM MEAL_REMINDER_LOG`, 'reminder_log', 'MEAL_REMINDER_LOG');
  // financial children -> parents
  await del(`DELETE FROM BILL_ALLOCATIONS`, 'bill_allocations', 'BILL_ALLOCATIONS');
  await del(`DELETE FROM MONTHLY_BILLS`, 'monthly_bills', 'MONTHLY_BILLS');
  await del(`DELETE FROM PAYMENTS`, 'payments', 'PAYMENTS');
  await del(`DELETE FROM DEPOSITS`, 'deposits', 'DEPOSITS');
  await del(`DELETE FROM OTHER_CHARGES`, 'other_charges', 'OTHER_CHARGES');
  await del(`DELETE FROM MEMBER_MONTHLY_SUMMARY`, 'member_monthly_summary', 'MEMBER_MONTHLY_SUMMARY');
  await del(`DELETE FROM MONTHLY_ACCOUNTS`, 'monthly_accounts', 'MONTHLY_ACCOUNTS');
  await del(`DELETE FROM MONTHLY_CLOSINGS`, 'monthly_closings', 'MONTHLY_CLOSINGS');
  // meals
  await del(`DELETE FROM MEAL_ENTRIES`, 'meal_entries', 'MEAL_ENTRIES');
  await del(`DELETE FROM GUEST_MEALS`, 'guest_meals', 'GUEST_MEALS');
  await del(`DELETE FROM MEAL_REQUESTS`, 'meal_requests', 'MEAL_REQUESTS');
  await del(`DELETE FROM BAZAR_EXPENSES`, 'bazar_expenses', 'BAZAR_EXPENSES');
  // uploaded files (demo attachments)
  await del(`DELETE FROM UPLOADED_FILES`, 'uploaded_files', 'UPLOADED_FILES');

  // preserved counts
  for (const t of ['USERS','MEMBERS','ROLES','PERMISSIONS','ROLE_PERMISSIONS','USER_PERMISSIONS','SYSTEM_SETTINGS','USER_NOTIFICATION_PREFS','CHAT_THEME_PREFS','CHAT_MUTES','EXPENSE_CATEGORIES','BILL_CATEGORIES','ADMIN_PROFILES','AUDIT_LOGS','CONVERSATIONS','CONVERSATION_PARTICIPANTS']) {
    report.preserved[t] = await cnt(c, t);
  }
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(__dirname, 'backups', `cleanup_report_${Date.now()}.json`), JSON.stringify(report, null, 2));
  console.log('PRESERVED:', JSON.stringify(report.preserved));
  console.log('ERRORS:', report.errors.length ? report.errors : 'none');
  await c.close();
})();
