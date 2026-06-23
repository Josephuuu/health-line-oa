require('dotenv').config({ override: false });
const express = require('express');
const line = require('@line/bot-sdk');
const { createClient } = require('@supabase/supabase-js');

const config = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
};

console.log('SECRET:', process.env.LINE_CHANNEL_SECRET ? 'OK' : 'MISSING');
console.log('TOKEN:', process.env.LINE_CHANNEL_ACCESS_TOKEN ? 'OK' : 'MISSING');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? 'OK' : 'MISSING');
console.log('SUPABASE_KEY:', process.env.SUPABASE_KEY ? 'OK' : 'MISSING');
console.log('SUPABASE_URL value:', process.env.SUPABASE_URL);

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: config.channelAccessToken,
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const app = express();

app.get('/', (req, res) => res.send('Bot is running!'));

app.post('/webhook', line.middleware(config), (req, res) => {
  console.log('Webhook received!');
  Promise.all(req.body.events.map(handleEvent))
    .then(() => res.json({ status: 'ok' }))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

async function handleEvent(event) {
  console.log('Event received:', event.type);
  if (event.type !== 'message' || event.message.type !== 'text') return;

  const userMessage = event.message.text.trim();
  console.log('User typed:', userMessage);
  console.log('User typed (hex):', Buffer.from(userMessage).toString('hex'));

  const { data, error, status, statusText } = await supabase
    .rpc('search_menu', { search_term: userMessage });

  console.log('Status:', status, statusText);
  console.log('Data:', JSON.stringify(data));
  console.log('Error:', JSON.stringify(error));

  if (error || !data || data.length === 0) {
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: `ไม่พบเมนู "${userMessage}" ครับ` }],
    });
  }

  const limited = data.slice(0, 5);

  const menuList = limited.map(item =>
    `🍽 ${item.name} (${item.shop})\n` +
    `🔥 ${item.calories} kcal\n` +
    `💪 Protein: ${item.protein}g | Fat: ${item.fat}g | Carb: ${item.carbohydrate}g`
  ).join('\n\n');

  const suffix = data.length > 5 ? `\n\n...และอีก ${data.length - 5} เมนู พิมพ์ชื่อให้เฉพาะเจาะจงกว่านี้ได้ครับ` : '';

  return client.replyMessage({
    replyToken: event.replyToken,
    messages: [{ type: 'text', text: menuList + suffix }],
  });
}

app.listen(process.env.PORT || 3000, () => {
  console.log(`Server running on port ${process.env.PORT || 3000}`);
});