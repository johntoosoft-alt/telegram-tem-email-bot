const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const http = require('http');

// Install: npm install node-telegram-bot-api axios

// Create a simple HTTP server to keep Replit/Render alive
const server = http.createServer((req, res) => {
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`
    <html>
      <body style="font-family: Arial; text-align: center; padding: 50px;">
        <h1>🤖 Temp Email Bot is Running!</h1>
        <p>✅ Status: Active</p>
        <p>⏰ Uptime: ${hours}h ${minutes}m</p>
        <p>📧 <a href="https://t.me/YOUR_BOT_USERNAME">Open Bot in Telegram</a></p>
      </body>
    </html>
  `);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('🌐 HTTP server running on port', PORT);
});

class TempEmailBot {
  constructor(token) {
    this.bot = new TelegramBot(token, { polling: true });
    this.userEmails = new Map();
    this.apiBase = 'https://api.mail.tm';
    this.tokens = new Map(); // Store auth tokens
    this.setupHandlers();
    console.log('🤖 Bot initialized successfully!');
  }

  setupHandlers() {
    this.bot.onText(/\/start/, (msg) => this.handleStart(msg));
    this.bot.on('callback_query', (query) => this.handleCallback(query));
    
    this.bot.on('polling_error', (error) => {
      console.error('❌ Polling error:', error.message);
      if (error.message && error.message.includes('404')) {
        console.error('⚠️ INVALID BOT TOKEN! Please check your token from @BotFather');
        console.error('Your token should look like: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz');
      }
    });
  }

  async handleStart(msg) {
    const keyboard = {
      inline_keyboard: [
        [{ text: '📧 Generate New Email', callback_data: 'generate' }],
        [{ text: '📬 My Emails', callback_data: 'my_emails' }],
        [{ text: 'ℹ️ Help', callback_data: 'help' }]
      ]
    };

    try {
      await this.bot.sendMessage(
        msg.chat.id,
        '🎉 *Welcome to Temp Email Bot!*\n\n' +
        'Generate temporary emails instantly and keep them for later use.\n\n' +
        'Choose an option below:',
        { parse_mode: 'Markdown', reply_markup: keyboard }
      );
    } catch (error) {
      console.error('Error in handleStart:', error.message);
    }
  }

  generateRandomString(length) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  async getDomains() {
    try {
      const response = await axios.get(this.apiBase + '/domains', { timeout: 15000 });
      return response.data['hydra:member'] || [];
    } catch (error) {
      console.error('❌ Error getting domains:', error.message);
      return [];
    }
  }

  async generateEmail() {
    try {
      console.log('📧 Generating email...');
      
      // Get available domains
      const domains = await this.getDomains();
      if (domains.length === 0) {
        console.error('❌ No domains available');
        return null;
      }

      const domain = domains[0].domain;
      const username = this.generateRandomString(10);
      const email = username + '@' + domain;
      const password = this.generateRandomString(16);

      console.log('Creating account:', email);

      // Create account
      const createResponse = await axios.post(
        this.apiBase + '/accounts',
        {
          address: email,
          password: password
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 15000
        }
      );

      console.log('✅ Account created');

      // Get auth token
      const tokenResponse = await axios.post(
        this.apiBase + '/token',
        {
          address: email,
          password: password
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 15000
        }
      );

      const token = tokenResponse.data.token;
      this.tokens.set(email, { token, password });

      console.log('✅ Email generated:', email);
      return email;
    } catch (error) {
      console.error('❌ Error generating email:', error.message);
      if (error.response) {
        console.error('Response:', error.response.data);
      }
      return null;
    }
  }

  async checkInbox(email) {
    try {
      const tokenData = this.tokens.get(email);
      if (!tokenData) {
        console.error('❌ No token for email:', email);
        return [];
      }

      console.log('📬 Checking inbox for:', email);

      const response = await axios.get(this.apiBase + '/messages', {
        headers: {
          'Authorization': 'Bearer ' + tokenData.token
        },
        timeout: 15000
      });

      return response.data['hydra:member'] || [];
    } catch (error) {
      console.error('❌ Error checking inbox:', error.message);
      return [];
    }
  }

  async readMessage(email, msgId) {
    try {
      const tokenData = this.tokens.get(email);
      if (!tokenData) return null;

      console.log('📨 Reading message:', msgId);

      const response = await axios.get(this.apiBase + '/messages/' + msgId, {
        headers: {
          'Authorization': 'Bearer ' + tokenData.token
        },
        timeout: 15000
      });

      return response.data;
    } catch (error) {
      console.error('❌ Error reading message:', error.message);
      return null;
    }
  }

  async handleCallback(query) {
    if (!query.message || !query.data) return;

    const userId = query.from.id;
    const data = query.data;
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;

    try {
      await this.bot.answerCallbackQuery(query.id);
    } catch (e) {
      console.error('Error answering callback:', e.message);
    }

    try {
      if (data === 'generate') {
        await this.bot.editMessageText('⏳ Generating new email...', {
          chat_id: chatId,
          message_id: messageId
        });

        const email = await this.generateEmail();

        if (email) {
          if (!this.userEmails.has(userId)) {
            this.userEmails.set(userId, []);
          }
          const emails = this.userEmails.get(userId);
          emails.push(email);

          const keyboard = {
            inline_keyboard: [
              [{ text: '📥 Check Inbox', callback_data: 'check_' + email }],
              [{ text: '📋 Copy Email', callback_data: 'copy_' + email }],
              [
                { text: '➕ Generate Another', callback_data: 'generate' },
                { text: '🗑️ Delete', callback_data: 'delete_' + email }
              ],
              [{ text: '🔙 Back to Menu', callback_data: 'back' }]
            ]
          };

          await this.bot.editMessageText(
            '✅ *Email Generated!*\n\n📧 `' + email + '`\n\n💾 Saved to your account\n⏰ Valid for 24 hours\n📊 Total emails: ' + emails.length,
            {
              chat_id: chatId,
              message_id: messageId,
              parse_mode: 'Markdown',
              reply_markup: keyboard
            }
          );
        } else {
          const keyboard = {
            inline_keyboard: [
              [{ text: '🔄 Try Again', callback_data: 'generate' }],
              [{ text: '🔙 Back to Menu', callback_data: 'back' }]
            ]
          };
          
          await this.bot.editMessageText(
            '❌ *Failed to generate email*\n\n' +
            'The service might be temporarily busy.\n\n' +
            'Please try again.',
            {
              chat_id: chatId,
              message_id: messageId,
              parse_mode: 'Markdown',
              reply_markup: keyboard
            }
          );
        }
      } 
      
      else if (data === 'my_emails') {
        const userEmailList = this.userEmails.get(userId) || [];

        if (userEmailList.length === 0) {
          const keyboard = { 
            inline_keyboard: [[{ text: '🔙 Back', callback_data: 'back' }]] 
          };
          await this.bot.editMessageText(
            "📭 You don't have any saved emails yet.\n\nGenerate one to get started!",
            {
              chat_id: chatId,
              message_id: messageId,
              reply_markup: keyboard
            }
          );
        } else {
          const buttons = [];
          for (let i = 0; i < userEmailList.length; i++) {
            const email = userEmailList[i];
            const shortEmail = email.length > 35 ? email.substring(0, 35) + '...' : email;
            buttons.push([{
              text: '📧 ' + (i + 1) + '. ' + shortEmail,
              callback_data: 'view_' + email
            }]);
          }
          buttons.push([
            { text: '➕ Generate New Email', callback_data: 'generate' },
            { text: '🔙 Back', callback_data: 'back' }
          ]);

          const keyboard = { inline_keyboard: buttons };

          await this.bot.editMessageText(
            '📬 *Your Saved Emails (' + userEmailList.length + ')*\n\nSelect an email to manage or generate a new one:',
            {
              chat_id: chatId,
              message_id: messageId,
              parse_mode: 'Markdown',
              reply_markup: keyboard
            }
          );
        }
      } 
      
      else if (data.startsWith('view_')) {
        const email = data.substring(5);
        const userEmailList = this.userEmails.get(userId) || [];
        const emailIndex = userEmailList.indexOf(email);
        
        const keyboard = {
          inline_keyboard: [
            [{ text: '📥 Check Inbox', callback_data: 'check_' + email }],
            [{ text: '📋 Copy Email', callback_data: 'copy_' + email }],
            [
              { text: '⬅️ Prev', callback_data: 'prev_' + email },
              { text: '➡️ Next', callback_data: 'next_' + email }
            ],
            [
              { text: '➕ Generate New', callback_data: 'generate' },
              { text: '🗑️ Delete', callback_data: 'delete_' + email }
            ],
            [{ text: '🔙 My Emails', callback_data: 'my_emails' }]
          ]
        };

        // Disable prev/next if at boundaries
        if (emailIndex <= 0) {
          keyboard.inline_keyboard[2][0] = { text: '⬅️ •', callback_data: 'noop' };
        }
        if (emailIndex >= userEmailList.length - 1) {
          keyboard.inline_keyboard[2][1] = { text: '• ➡️', callback_data: 'noop' };
        }

        await this.bot.editMessageText(
          '📧 *Email ' + (emailIndex + 1) + ' of ' + userEmailList.length + '*\n\n`' + email + '`',
          {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
            reply_markup: keyboard
          }
        );
      } 
      
      else if (data.startsWith('prev_') || data.startsWith('next_')) {
        const isNext = data.startsWith('next_');
        const email = data.substring(5);
        const userEmailList = this.userEmails.get(userId) || [];
        const currentIndex = userEmailList.indexOf(email);
        
        let newIndex;
        if (isNext) {
          newIndex = currentIndex + 1;
          if (newIndex >= userEmailList.length) newIndex = userEmailList.length - 1;
        } else {
          newIndex = currentIndex - 1;
          if (newIndex < 0) newIndex = 0;
        }
        
        const newEmail = userEmailList[newIndex];
        
        const keyboard = {
          inline_keyboard: [
            [{ text: '📥 Check Inbox', callback_data: 'check_' + newEmail }],
            [{ text: '📋 Copy Email', callback_data: 'copy_' + newEmail }],
            [
              { text: '⬅️ Prev', callback_data: 'prev_' + newEmail },
              { text: '➡️ Next', callback_data: 'next_' + newEmail }
            ],
            [
              { text: '➕ Generate New', callback_data: 'generate' },
              { text: '🗑️ Delete', callback_data: 'delete_' + newEmail }
            ],
            [{ text: '🔙 My Emails', callback_data: 'my_emails' }]
          ]
        };

        // Disable prev/next if at boundaries
        if (newIndex <= 0) {
          keyboard.inline_keyboard[2][0] = { text: '⬅️ •', callback_data: 'noop' };
        }
        if (newIndex >= userEmailList.length - 1) {
          keyboard.inline_keyboard[2][1] = { text: '• ➡️', callback_data: 'noop' };
        }

        await this.bot.editMessageText(
          '📧 *Email ' + (newIndex + 1) + ' of ' + userEmailList.length + '*\n\n`' + newEmail + '`',
          {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
            reply_markup: keyboard
          }
        );
      }
      
      else if (data === 'noop') {
        // Do nothing - disabled button
        return;
      } 
      
      else if (data.startsWith('check_')) {
        const email = data.substring(6);
        await this.bot.editMessageText('⏳ Checking inbox...', {
          chat_id: chatId,
          message_id: messageId
        });

        const messages = await this.checkInbox(email);

        if (messages.length === 0) {
          const keyboard = {
            inline_keyboard: [
              [{ text: '🔄 Refresh', callback_data: 'check_' + email }],
              [{ text: '🔙 Back', callback_data: 'view_' + email }]
            ]
          };

          await this.bot.editMessageText(
            '📭 *Inbox Empty*\n\nNo messages for `' + email + '`',
            {
              chat_id: chatId,
              message_id: messageId,
              parse_mode: 'Markdown',
              reply_markup: keyboard
            }
          );
        } else {
          const buttons = [];
          const maxMessages = Math.min(messages.length, 10);
          
          for (let i = 0; i < maxMessages; i++) {
            const msg = messages[i];
            const subject = (msg.subject || 'No Subject').substring(0, 40);
            buttons.push([{
              text: '✉️ ' + subject,
              callback_data: 'read_' + email + '_' + msg.id
            }]);
          }
          
          buttons.push([
            { text: '🔄 Refresh', callback_data: 'check_' + email },
            { text: '🔙 Back', callback_data: 'view_' + email }
          ]);

          const keyboard = { inline_keyboard: buttons };

          await this.bot.editMessageText(
            '📬 *Inbox for ' + email + '*\n\nMessages: ' + messages.length + '\n\nSelect a message to read:',
            {
              chat_id: chatId,
              message_id: messageId,
              parse_mode: 'Markdown',
              reply_markup: keyboard
            }
          );
        }
      } 
      
      else if (data.startsWith('read_')) {
        const parts = data.split('_');
        const email = parts[1];
        const msgId = parts[2];

        await this.bot.editMessageText('⏳ Loading message...', {
          chat_id: chatId,
          message_id: messageId
        });

        const message = await this.readMessage(email, msgId);

        if (message) {
          const textBody = (message.text || message.html || 'No content').substring(0, 800);
          const fromEmail = message.from && message.from.address ? message.from.address : 'Unknown';
          const keyboard = {
            inline_keyboard: [[{ text: '🔙 Back to Inbox', callback_data: 'check_' + email }]]
          };

          await this.bot.editMessageText(
            '📨 *From:* ' + fromEmail + '\n' +
            '📋 *Subject:* ' + (message.subject || 'No Subject') + '\n' +
            '📅 *Date:* ' + (message.createdAt || 'Unknown') + '\n\n' +
            '💬 *Message:*\n' + textBody + '...',
            {
              chat_id: chatId,
              message_id: messageId,
              parse_mode: 'Markdown',
              reply_markup: keyboard
            }
          );
        }
      } 
      
      else if (data.startsWith('copy_')) {
        const email = data.substring(5);
        await this.bot.answerCallbackQuery(query.id, {
          text: 'Email: ' + email,
          show_alert: true
        });
      } 
      
      else if (data.startsWith('delete_')) {
        const email = data.substring(7);
        const userEmailList = this.userEmails.get(userId) || [];
        const index = userEmailList.indexOf(email);

        if (index > -1) {
          userEmailList.splice(index, 1);
          this.userEmails.set(userId, userEmailList);
          this.tokens.delete(email);

          const keyboard = {
            inline_keyboard: [[{ text: '🔙 My Emails', callback_data: 'my_emails' }]]
          };

          await this.bot.editMessageText(
            '✅ Email deleted!\n\n`' + email + '`',
            {
              chat_id: chatId,
              message_id: messageId,
              parse_mode: 'Markdown',
              reply_markup: keyboard
            }
          );
        }
      } 
      
      else if (data === 'help') {
        const keyboard = {
          inline_keyboard: [[{ text: '🔙 Back', callback_data: 'back' }]]
        };

        await this.bot.editMessageText(
          "ℹ️ *How to Use:*\n\n" +
          "1️⃣ Generate a temporary email\n" +
          "2️⃣ Use it anywhere you need\n" +
          "3️⃣ Check inbox for messages\n" +
          "4️⃣ All emails are saved automatically\n\n" +
          "*Features:*\n" +
          "📧 Generate unlimited emails\n" +
          "💾 Auto-save all your emails\n" +
          "📬 Check inbox anytime\n" +
          "🗑️ Delete when done\n\n" +
          "⏰ Emails are valid for 24 hours.",
          {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
            reply_markup: keyboard
          }
        );
      } 
      
      else if (data === 'back') {
        const keyboard = {
          inline_keyboard: [
            [{ text: '📧 Generate New Email', callback_data: 'generate' }],
            [{ text: '📬 My Emails', callback_data: 'my_emails' }],
            [{ text: 'ℹ️ Help', callback_data: 'help' }]
          ]
        };

        await this.bot.editMessageText(
          '🎉 *Temp Email Bot*\n\nChoose an option below:',
          {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
            reply_markup: keyboard
          }
        );
      }
    } catch (error) {
      console.error('Error handling callback:', error.message);
    }
  }
}

// PASTE YOUR BOT TOKEN HERE between the quotes
const BOT_TOKEN = '';  // Put your token between the quotes like: '123456789:ABCdefGHI...'

// Validation
if (!BOT_TOKEN || BOT_TOKEN.trim() === '') {
  console.error('');
  console.error('❌❌❌ ERROR: BOT TOKEN IS EMPTY! ❌❌❌');
  console.error('');
  console.error('📝 Follow these steps:');
  console.error('1. Open Telegram and find @BotFather');
  console.error('2. Send /mybots');
  console.error('3. Select your bot');
  console.error('4. Click "API Token"');
  console.error('5. Copy the ENTIRE token');
  console.error('6. Paste it between the quotes');
  console.error('   Example: const BOT_TOKEN = "7123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw";');
  console.error('');
  process.exit(1);
}

if (!BOT_TOKEN.includes(':')) {
  console.error('❌ Invalid token format! Token must contain a colon (:)');
  console.error('Your token should look like: 123456789:ABCdefGHIjklMNOpqrs');
  process.exit(1);
}

console.log('✅ Bot token loaded!');
console.log('📝 Token preview:', BOT_TOKEN.substring(0, 15) + '...');

const emailBot = new TempEmailBot(BOT_TOKEN);
console.log('🤖 Bot is starting...');
