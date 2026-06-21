require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const { createClient } = require('@supabase/supabase-js');

const config = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
};

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
  Promise.all(req.body.events.map(handleEvent))
    .then(() => res.json({ status: 'ok' }))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return;

  const userMessage = event.message.text.trim();

  // ค้นหาเมนูจาก Database
  const { data, error } = await supabase
    .from('menu')
    .select('*')
    .ilike('name', `%${userMessage}%`);

  if (error || data.length === 0) {
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ 
        type: 'text', 
        text: `ไม่พบเมนู "${userMessage}" ในโรงอาหารครับ ลองพิมพ์ชื่ออาหารใหม่อีกครั้ง` 
      }],
    });
  }

  // สร้างข้อความตอบกลับ
  const menuList = data.map(item => 
    `🍽 ${item.name} (${item.shop})\n` +
    `🔥 ${item.calories} kcal\n` +
    `💪 Protein: ${item.protein}g | Fat: ${item.fat}g | Carb: ${item.carbohydrate}g`
  ).join('\n\n');

  return client.replyMessage({
    replyToken: event.replyToken,
    messages: [{ 
      type: 'text', 
      text: menuList
    }],
  });
}

app.listen(process.env.PORT || 3000, () => {
  console.log(`Server running on port ${process.env.PORT || 3000}`);
});