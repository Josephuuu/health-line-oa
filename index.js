require('dotenv').config({ override: false });
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
  console.log('Webhook received!');
  Promise.all(req.body.events.map(handleEvent))
    .then(() => res.json({ status: 'ok' }))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return;

  const userId = event.source.userId;
  const userMessage = event.message.text.trim();
  
  console.log(`User ${userId} typed: ${userMessage}`);

  // 1. ดึงสถานะปัจจุบันของ User จาก Supabase (ถ้าไม่มีให้สร้างเป็น MAIN_MENU)
  let { data: stateData } = await supabase
    .from('user_states')
    .select('state')
    .eq('user_id', userId)
    .single();

  let currentState = stateData ? stateData.state : 'MAIN_MENU';

  if (!stateData) {
    await supabase.from('user_states').insert({ user_id: userId, state: 'MAIN_MENU' });
  }

  // 2. [GLOBAL COMMANDS] ถ้าพิมพ์คำเหล่านี้ หรือกดจาก Rich Menu จะเปลี่ยนฟีเจอร์ทันที
  if (userMessage === 'สุขภาพจิต') {
    await supabase.from('user_states').upsert({ user_id: userId, state: 'MENTAL_HEALTH_TEST' });
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: 'ยินดีต้อนรับสู่ระบบประเมินสุขภาพจิตครับ วันนี้คุณรู้สึกอย่างไรบ้าง? (นี่คือช่องจำลองระบบ)' }],
    });
  }

  if (userMessage === 'อาหารโรงอาหาร') {
    await supabase.from('user_states').upsert({ user_id: userId, state: 'AWAITING_FOOD_NAME' });
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: 'โปรดพิมพ์ชื่อเมนูอาหารในโรงอาหารที่ต้องการทราบคุณค่าโภชนาการได้เลยครับ' }],
    });
  }

  if (userMessage === 'แนะนำอาหารลดน้ำหนัก') {
    await supabase.from('user_states').upsert({ user_id: userId, state: 'WEIGHT_LOSS_CONSULT' });
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: 'คุณอยากให้แนะนำอาหารลดน้ำหนักแนวไหน พิมพ์บอกความต้องการมาได้เลยครับ' }],
    });
  }

  if (userMessage === 'ภารกิจสุขภาพประจำวัน') {
    await supabase.from('user_states').upsert({ user_id: userId, state: 'DAILY_MISSION' });
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: 'วันนี้คุณเริ่มทำภารกิจหรือยังครับ? หรืออยากให้เช็ค Progress ส่วนไหน บอกได้เลย' }],
    });
  }

  if (userMessage === 'กลับหน้าหลัก' || userMessage === 'เมนูหลัก') {
    await supabase.from('user_states').upsert({ user_id: userId, state: 'MAIN_MENU' });
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: 'กลับสู่หน้าหลักแล้วครับ เลือกฟีเจอร์ที่ต้องการใช้งานได้เลย' }],
    });
  }

  // 3. แยกการทำงานตามสถานะปัจจุบันของ User (State Routing)
  switch (currentState) {
    case 'AWAITING_FOOD_NAME': {
      // ใช้ Logic ค้นหาอาหารเดิมของคุณทั้งหมด
      const { data, error } = await supabase.rpc('search_menu', { search_term: userMessage });

      if (error || !data || data.length === 0) {
        return client.replyMessage({
          replyToken: event.replyToken,
          messages: [{ type: 'text', text: `ไม่พบเมนู "${userMessage}" ในโรงอาหารครับ พิมพ์ชื่ออื่นดูไหม หรือพิมพ์ "กลับหน้าหลัก" ได้ครับ` }],
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

    case 'MENTAL_HEALTH_TEST':
      // TODO: ใส่ข้อความหรือ Logic ของฟีเจอร์สุขภาพจิตในอนาคต
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: `[ฟีเจอร์สุขภาพจิต] ระบบได้รับข้อความของคุณแล้ว: "${userMessage}"` }],
      });

    case 'WEIGHT_LOSS_CONSULT':
      // TODO: ใส่ข้อความหรือเชื่อม AI แนะนำอาหารลดน้ำหนักในอนาคต
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: `[ฟีเจอร์ลดน้ำหนัก] คุณอยากทานเมนูไหนเป็นพิเศษไหม พิมพ์มาได้เลย` }],
      });

    case 'DAILY_MISSION':
      // TODO: ใส่ข้อความหรือ Logic เช็คภารกิจประจำวัน
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: `[ฟีเจอร์ภารกิจ] บันทึกความคืบหน้าเรียบร้อยแล้ว` }],
      });

    default:
      // หน้าแรกสุด (MAIN_MENU) ถ้าผู้ใช้พิมพ์อย่างอื่นที่ไม่ตรงคำสั่งหลัก
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: 'สวัสดีครับ! กรุณาเลือกฟีเจอร์จากเมนูด้านล่าง หรือพิมพ์คำว่า:\n\n🧠 สุขภาพจิต\n🍽 อาหารโรงอาหาร\n🥗 แนะนำอาหารลดน้ำหนัก\n🏃‍♂️ ภารกิจสุขภาพประจำวัน' }],
      });
  }
}

app.listen(process.env.PORT || 3000, () => {
  console.log(`Server running on port ${process.env.PORT || 3000}`);
});