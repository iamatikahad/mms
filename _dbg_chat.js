const path = require('path');
process.chdir(path.join(__dirname, 'backend'));
const chat = require('./backend/dist/services/chat.js');
(async () => {
  try {
    const convs = await chat.listConversations({ userId: 3, username: 'x', roleName: 'MEMBER', memberId: null, permissions: new Set() });
    console.log('convs:', JSON.stringify(convs).slice(0, 300));
    const g = convs.find(c => c.isGroup) || convs[0];
    const r = await chat.createMessage({ userId: 3, username: 'x', roleName: 'MEMBER', memberId: null, permissions: new Set() }, { CONVERSATION_ID: g.conversationId || g.CONVERSATION_ID, CONVERSATION_TYPE: 'GROUP' }, { body: 'direct service test' });
    console.log('created:', r.id);
  } catch (e) {
    console.log('ERR:', e.message);
    if (e.errorNum) console.log('ORA:', e.errorNum, e.offset);
    console.log(e.stack?.split('\n').slice(0, 6).join('\n'));
  }
  process.exit(0);
})();
