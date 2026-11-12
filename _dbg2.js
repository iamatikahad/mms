const chat = require('./backend/dist/services/chat.js');
(async () => {
  const user = { userId: 3, username: 'x', roleName: 'MEMBER', memberId: null };
  try {
    const conv = await chat.getConversation(1);
    console.log('conv:', JSON.stringify(conv));
    const ok = await chat.canAccessConversation(conv, user);
    console.log('access:', ok);
    const convs = await chat.listConversations(user);
    console.log('n convs:', convs.length);
  } catch (e) {
    console.log('ERR:', e.message);
    if (e.errorNum) console.log('ORA:', e.errorNum, 'offset', e.offset);
    console.log(e.stack?.split('\n').slice(0, 8).join('\n'));
  }
  process.exit(0);
})();
