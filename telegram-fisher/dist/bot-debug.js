import dotenv from 'dotenv';
import https from 'https';
dotenv.config();
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
function callAPI(method, params = {}) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify(params);
        const options = {
            hostname: 'api.telegram.org',
            port: 443,
            path: `/bot${BOT_TOKEN}/${method}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };
        console.log(`Calling ${method}...`);
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    console.log(`Response from ${method}:`, JSON.stringify(result, null, 2));
                    resolve(result);
                }
                catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', (e) => {
            console.error('Request error:', e);
            reject(e);
        });
        req.write(postData);
        req.end();
    });
}
async function sendMessage(chatId, text) {
    console.log(`Sending message to ${chatId}: ${text}`);
    const result = await callAPI('sendMessage', { chat_id: chatId, text });
    return result;
}
let offset = 0;
async function poll() {
    console.log(`\nPolling with offset ${offset}...`);
    try {
        const response = await callAPI('getUpdates', {
            offset,
            timeout: 10,
            allowed_updates: ['message']
        });
        if (response.ok) {
            console.log(`Received ${response.result.length} updates`);
            for (const update of response.result) {
                console.log('Processing update:', update.update_id);
                if (update.message && update.message.text) {
                    const msg = update.message;
                    const text = msg.text;
                    const chatId = msg.chat.id;
                    const username = msg.from.username || 'unknown';
                    console.log(`Message from @${username}: ${text}`);
                    if (text === '/start') {
                        await sendMessage(chatId, 'Welcome to SocialPay! Bot is working!');
                    }
                    else if (text === '/help') {
                        await sendMessage(chatId, 'Help: Use /start to begin');
                    }
                    else if (text === '/balance') {
                        await sendMessage(chatId, 'Balance check coming soon!');
                    }
                    else {
                        await sendMessage(chatId, `You said: ${text}`);
                    }
                }
                offset = update.update_id + 1;
            }
        }
        else {
            console.error('Error response:', response);
        }
    }
    catch (error) {
        console.error('Poll error:', error);
    }
    setTimeout(poll, 1000);
}
console.log('Starting debug bot...');
console.log('Token:', BOT_TOKEN.substring(0, 20) + '...');
callAPI('getMe').then((result) => {
    if (result.ok) {
        console.log('Bot info:', result.result);
        console.log('\nStarting polling...');
        poll();
    }
}).catch(console.error);
//# sourceMappingURL=bot-debug.js.map