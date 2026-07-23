require('dotenv').config({ override: false });
const express = require('express');
const line = require('@line/bot-sdk');
const { createClient } = require('@supabase/supabase-js');
const cron = require('node-cron');

const config = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
};

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: config.channelAccessToken,
});

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const app = express();

const COLORS = {
  PRIMARY: "#0D9488",
  SECONDARY: "#10B981",
  ACCENT: "#0284C7",
  NEUTRAL_DARK: "#1F2937",
  SUCCESS: "#059669",
  WARNING: "#D97706",
  DANGER: "#DC2626",
  WHITE: "#FFFFFF"
};

const MENTAL_QUESTIONS = [
  { id: 1, text: "1. รู้สึกพึงพอใจในชีวิต" },
  { id: 2, text: "2. รู้สึกสบายใจ ผ่อนคลาย" },
  { id: 3, text: "3. รู้สึกสดชื่น เบิกบานใจ" },
  { id: 4, text: "4. รู้สึกว่าชีวิตมีความสุขสงบ" },
  { id: 5, text: "5. รู้สึกเบื่อหน่าย หรือท้อแท้กับการใช้ชีวิต" }
];

// ==========================================
// ⏰ DAILY NOTIFICATION SCHEDULER (ระบบแจ้งเตือนภารกิจ)
// ==========================================
async function broadcastPushNotification(messageText) {
  try {
    const { data: users, error } = await supabase.from('user_profiles').select('user_id');
    if (error || !users || users.length === 0) return;

    for (const u of users) {
      try {
        await client.pushMessage({
          to: u.user_id,
          messages: [{ type: 'text', text: messageText }]
        });
      } catch (pushErr) {
        console.error(`Failed to push notification to ${u.user_id}:`, pushErr);
      }
    }
  } catch (err) {
    console.error('Broadcast Notification Error:', err);
  }
}

// 🌅 08:00 น. แจ้งเตือนช่วงเช้า
cron.schedule('0 8 * * *', () => {
  console.log('⏰ Trigger: Morning Notification (08:00)');
  broadcastPushNotification(
    '🌅 สวัสดีตอนเช้าครับ!\n\nอย่าลืมดื่มน้ำ 1 แก้วเพื่อปลุกร่างกายให้สดชื่นนะครับ 💧\n\n🎯 วันนี้มาพิชิตภารกิจสุขภาพประจำวันกัน! พิมพ์ "ภารกิจ" เพื่อเริ่มบันทึกได้เลยครับ ✨'
  );
}, { timezone: "Asia/Bangkok" });

// ☀️ 14:00 น. แจ้งเตือนช่วงบ่าย
cron.schedule('0 14 * * *', () => {
  console.log('⏰ Trigger: Afternoon Notification (14:00)');
  broadcastPushNotification(
    '☀️ พักสายตาและยืดเส้นยืดสายกันหน่อยครับ! 🧘‍♂️\n\nนั่งเรียน/ทำงานนานๆ อาจเมื่อยล้าได้ ขยับร่างกายสัก 1-2 นาที และอย่าลืมจิบน้ำเติมพลังด้วยนะครับ 💧'
  );
}, { timezone: "Asia/Bangkok" });

// 🌆 20:00 น. แจ้งเตือนช่วงค่ำ
cron.schedule('0 20 * * *', () => {
  console.log('⏰ Trigger: Evening Notification (20:00)');
  broadcastPushNotification(
    '🌆 โค้งสุดท้ายของวันแล้วครับ! 🎯\n\nวันนี้คุณดื่มน้ำ เดินก้าวสะสม หรือยืดตัวครบเป้าหมายหรือยังครับ? พิมพ์ "ภารกิจ" เพื่อเช็กอินและสรุปผลประจำวันได้เลยครับ ✨'
  );
}, { timezone: "Asia/Bangkok" });

app.get('/', (req, res) => res.send('Health Bot status: Active!'));

app.post('/webhook', line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then(() => res.json({ status: 'ok' }))
    .catch((err) => {
      console.error('Webhook Error:', err);
      res.status(500).end();
    });
});

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return;

  const userId = event.source.userId;
  const userMessage = event.message.text.trim();

  let { data: stateData } = await supabase.from('user_states').select('state, context').eq('user_id', userId).single();
  let currentState = stateData ? stateData.state : 'MAIN_MENU';
  let currentContext = stateData && stateData.context ? stateData.context : {};

  if (!stateData) {
    await supabase.from('user_states').insert({ user_id: userId, state: 'MAIN_MENU', context: {} });
    currentState = 'MAIN_MENU';
  }

  let { data: profile } = await supabase.from('user_profiles').select('*').eq('user_id', userId).single();

  // 🔑 Trigger คำสั่งลงทะเบียนด้วยตัวเอง
  const isRegTrigger = userMessage.includes('ลงทะเบียนประวัติสุขภาพ') || userMessage === 'ลงทะเบียน';

  if (isRegTrigger) {
    await updateState(userId, 'REG_GENDER', {});
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [getGenderFlexCard('🧪 [โหมดทดสอบ] เริ่มลงทะเบียนประวัติสุขภาพใหม่ครับ')]
    });
  }

  // 🚨 บังคับลงทะเบียนอัตโนมัติเฉพาะ User ใหม่
  if (!profile && currentState === 'MAIN_MENU') {
    await updateState(userId, 'REG_GENDER', {});
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [getGenderFlexCard('ยินดีต้อนรับครับ! เนื่องจากใช้งานครั้งแรก มาลงทะเบียนประวัติสุขภาพกันก่อนนะครับ 😊')]
    });
  }

  const mainMenuText = `📌 เมนูหลักระบบดูแลสุขภาพ:\n\n` +
                       `1️⃣ [คำนวณแคลอรี่และโภชนาการ]\n` +
                       `2️⃣ [ภารกิจสุขภาพประจำวัน]\n` +
                       `3️⃣ [แบบทดสอบสุขภาพจิต]\n` +
                       `4️⃣ [แนะนำอาหารลดน้ำหนัก]\n\n` +
                       `👉 กดปุ่มบน Rich Menu หรือพิมพ์ชื่อเมนูเพื่อใช้งานได้เลยครับ!`;

  if (userMessage === 'กลับหน้าหลัก' || userMessage === 'เมนูหลัก' || userMessage === 'เมนู') {
    await updateState(userId, 'MAIN_MENU', {});
    return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: mainMenuText }] });
  }

  // 🎯 Interceptor ตรวจจับ 4 ฟีเจอร์หลัก
  const isSearchTrigger = userMessage.includes('คำนวณแคลอรี่') || userMessage.includes('โภชนาการ') || userMessage.includes('ค้นหาอาหาร');
  const isMissionTrigger = userMessage.includes('ภารกิจ') || userMessage.includes('บันทึกประจำวัน');
  const isMentalTrigger = userMessage.includes('สุขภาพจิต') || userMessage.includes('ประเมินสุขภาพจิต') || userMessage.includes('แบบทดสอบสุขภาพจิต');
  const isFoodTrigger = userMessage.includes('แนะนำอาหาร') || userMessage.includes('อาหารลดน้ำหนัก');

  const isAnsweringMentalTest = (currentState === 'MONTHLY_MENTAL') && ['0', '1', '2', '3'].includes(userMessage);

  if ((isSearchTrigger || isMissionTrigger || isMentalTrigger || isFoodTrigger) && !isAnsweringMentalTest && currentState !== 'MAIN_MENU') {
    currentState = 'MAIN_MENU';
    currentContext = {};
  }

  // ==========================================
  // 📥 MAIN MENU ROUTING
  // ==========================================
  if (currentState === 'MAIN_MENU') {
    
    // 1️⃣ ฟีเจอร์ 1: คำนวณแคลอรี่และโภชนาการ
    if (isSearchTrigger) {
      await updateState(userId, 'SEARCH_NUTRIENT', { offset: 0 });
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: '🔍 พิมพ์ชื่อเมนูอาหารในโรงเรียนที่ต้องการค้นหาได้เลยครับ (เช่น ไก่, ข้าวผัด, กะเพรา)' }] });
    }

    // 2️⃣ ฟีเจอร์ 2: ภารกิจสุขภาพประจำวัน
    if (isMissionTrigger) {
      const todayStr = new Date().toISOString().split('T')[0];
      let { data: missionLog } = await supabase.from('daily_missions').select('*').eq('user_id', userId).eq('log_date', todayStr).single();

      if (!missionLog) {
        const { data: newLog } = await supabase.from('daily_missions').insert({
          user_id: userId, log_date: todayStr, water_accum_ml: 0, stretch_count: 0, step_count: 0
        }).select().single();
        missionLog = newLog || { water_accum_ml: 0, stretch_count: 0, step_count: 0, streak_count: 1 };
      }

      const targetWater = profile?.target_water_ml || 2000;
      const targetSteps = profile?.target_steps || 10000;
      const waterPct = Math.min(100, Math.round((missionLog.water_accum_ml / targetWater) * 100));
      const stepPct = Math.min(100, Math.round((missionLog.step_count / targetSteps) * 100));
      const stretchPct = Math.min(100, Math.round((missionLog.stretch_count / 3) * 100));
      const totalPct = Math.round((waterPct + stepPct + stretchPct) / 3);

      const missionCard = {
        type: "flex", altText: "🎯 ภารกิจสุขภาพประจำวันของคุณ",
        contents: {
          type: "bubble",
          header: {
            type: "box", layout: "vertical", backgroundColor: COLORS.PRIMARY,
            contents: [
              { type: "text", text: "🎯 ภารกิจสุขภาพประจำวัน", color: COLORS.WHITE, weight: "bold", size: "md" },
              { type: "text", text: `สำเร็จรวม: ${totalPct}% | ต่อเนื่อง: ${missionLog.streak_count || 1} วัน 🔥`, color: "#CCFBF1", size: "xs", margin: "xs" }
            ]
          },
          body: {
            type: "box", layout: "vertical",
            contents: [
              // 💧 ดื่มน้ำ
              { type: "text", text: `💧 ดื่มน้ำ: ${missionLog.water_accum_ml} / ${targetWater} ml (${waterPct}%)`, size: "xs", color: COLORS.ACCENT, weight: "bold" },
              {
                type: "box", layout: "horizontal", margin: "xs",
                contents: [
                  { type: "button", style: "secondary", height: "sm", action: { type: "message", label: "+250", text: "บันทึกน้ำ 250" } },
                  { type: "button", style: "secondary", height: "sm", margin: "xs", action: { type: "message", label: "+500", text: "บันทึกน้ำ 500" } },
                  { type: "button", style: "secondary", height: "sm", margin: "xs", action: { type: "message", label: "ระบุ", text: "ระบุปริมาณน้ำ" } }
                ]
              },

              // 🧘‍♂️ ยืดเส้นยืดสาย
              { type: "text", text: `🧘‍♂️ ยืดตัว: ${missionLog.stretch_count} / 3-5 ครั้ง`, size: "xs", color: COLORS.SECONDARY, margin: "md", weight: "bold" },
              {
                type: "box", layout: "horizontal", margin: "xs",
                contents: [
                  { type: "button", style: "primary", color: COLORS.SECONDARY, height: "sm", action: { type: "message", label: "+1 ครั้ง", text: "บันทึกยืดตัว 1" } },
                  { type: "button", style: "primary", color: COLORS.SECONDARY, height: "sm", margin: "xs", action: { type: "message", label: "3 ครั้ง", text: "บันทึกยืดตัว 3" } },
                  { type: "button", style: "primary", color: COLORS.SECONDARY, height: "sm", margin: "xs", action: { type: "message", label: "5 ครั้ง", text: "บันทึกยืดตัว 5" } }
                ]
              },

              // 🚶‍♂️ เดินสะสม
              { type: "text", text: `🚶‍♂️ เดินสะสม: ${missionLog.step_count} / ${targetSteps} ก้าว (${stepPct}%)`, size: "xs", color: COLORS.WARNING, margin: "md", weight: "bold" },
              { type: "button", style: "primary", color: COLORS.WARNING, height: "sm", margin: "xs", action: { type: "message", label: "👟 บันทึกจำนวนก้าวเดิน", text: "บันทึกก้าวเดิน" } },

              { type: "separator", margin: "md" },
              
              // ⚖️ อัปเดตสัดส่วนประจำสัปดาห์
              { type: "button", style: "secondary", height: "sm", margin: "md", action: { type: "message", label: "⚖️ อัปเดตน้ำหนัก/ส่วนสูง (7 วัน)", text: "อัปเดตน้ำหนักส่วนสูง" } },
              { type: "button", style: "link", height: "sm", action: { type: "message", label: "🌤️ บันทึกอารมณ์/ความรู้สึกวันนี้", text: "เช็กอินอารมณ์" } }
            ]
          }
        }
      };

      await updateState(userId, 'MISSION_ACTION', {});
      return client.replyMessage({ replyToken: event.replyToken, messages: [missionCard] });
    }

    // 3️⃣ ฟีเจอร์ 3: แบบทดสอบสุขภาพจิต
    if (isMentalTrigger) {
      currentContext = { current_q: 1, scores: {} };
      await updateState(userId, 'MONTHLY_MENTAL', currentContext);
      return sendMentalQuestion(event, 1, '🧠 [แบบทดสอบสุขภาพจิต]\nลองทำประเมินสภาวะอารมณ์สั้นๆ เพื่อตรวจเช็กสุขภาพใจกันครับ\n\n');
    }

    // 4️⃣ ฟีเจอร์ 4: แนะนำอาหารลดน้ำหนัก
    if (isFoodTrigger) {
      await updateState(userId, 'MAIN_MENU', {});
      const tdee = profile?.tdee || 2000;
      const targetCal = Math.round((tdee - 500) / 3);
      const chronicDisease = profile?.chronic_disease || 'ไม่มี';
      const dietary = profile?.dietary_restriction || 'ไม่มี';

      let { data: allMenus } = await supabase.from('canteen_menus').select('*').lte('calories', targetCal);
      if (!allMenus || allMenus.length === 0) {
        let { data: fallback } = await supabase.from('canteen_menus').select('*').limit(50);
        allMenus = fallback || [];
      }

      let fitMenus = allMenus.filter(item => {
        const name = item.menu_name || '';
        if (dietary.includes('อิสลาม') || dietary.includes('ฮาลาล')) {
          if (['หมู', 'เบคอน', 'กุนเชียง', 'ตับหมู', 'หมูกรอบ'].some(kw => name.includes(kw))) return false;
        }
        if (dietary.includes('มังสวิรัติ') || dietary.includes('วีแกน')) {
          if (['หมู', 'ไก่', 'เนื้อ', 'กุ้ง', 'หมึก', 'ปลา', 'ปู', 'หอย', 'เป็ด', 'ไข่', 'ตับ'].some(kw => name.includes(kw))) return false;
        }
        if (dietary.includes('แพ้อาหารทะเล')) {
          if (['กุ้ง', 'หมึก', 'ปลา', 'ปู', 'หอย', 'ทะเล'].some(kw => name.includes(kw))) return false;
        }
        if (dietary.includes('แพ้ถั่ว')) {
          if (['ถั่ว', 'เต้าหู้', 'ถั่วเหลือง'].some(kw => name.includes(kw))) return false;
        }
        return true;
      });

      if (fitMenus.length === 0) fitMenus = allMenus;
      const randomSelected = fitMenus.sort(() => 0.5 - Math.random()).slice(0, 3);
      const menuContents = randomSelected.map((item, idx) => ({
        type: "box", layout: "horizontal", margin: "md",
        contents: [
          { type: "text", text: `${idx + 1}. ${item.menu_name}`, size: "sm", color: COLORS.NEUTRAL_DARK, flex: 4, weight: "bold" },
          { type: "text", text: `${item.calories} kcal`, size: "sm", color: COLORS.PRIMARY, align: "end", flex: 2, weight: "bold" }
        ]
      }));

      const flexMenuCard = {
        type: "flex", altText: "🥗 เมนูอาหารแนะนำลดน้ำหนัก",
        contents: {
          type: "bubble",
          header: {
            type: "box", layout: "vertical", backgroundColor: COLORS.PRIMARY,
            contents: [
              { type: "text", text: "🥗 เมนูอาหารแนะนำลดน้ำหนัก", weight: "bold", size: "lg", color: COLORS.WHITE },
              { type: "text", text: `เป้าหมายมื้อนี้: ไม่เกิน ${targetCal} kcal`, size: "xs", color: "#CCFBF1", margin: "xs" }
            ]
          },
          body: {
            type: "box", layout: "vertical",
            contents: [
              { type: "text", text: `🩺 โรคประจำตัว: ${chronicDisease}`, size: "xs", color: "#6B7280" },
              { type: "text", text: `🥗 ข้อจำกัดอาหาร: ${dietary}`, size: "xs", color: COLORS.PRIMARY, weight: "bold", margin: "xs" },
              { type: "separator", margin: "md" },
              ...menuContents
            ]
          },
          footer: {
            type: "box", layout: "vertical",
            contents: [
              { type: "button", style: "primary", color: COLORS.SECONDARY, action: { type: "message", label: "🎲 สุ่มเมนูใหม่อีกครั้ง", text: "แนะนำอาหารลดน้ำหนัก" } }
            ]
          }
        }
      };
      return client.replyMessage({ replyToken: event.replyToken, messages: [flexMenuCard] });
    }
  }

  // ==========================================
  // ⚡ CONTROL STATES MACHINE
  // ==========================================
  switch (currentState) {
    
    // โหมดรับค่าภารกิจ
    case 'MISSION_ACTION':
      const todayStr = new Date().toISOString().split('T')[0];
      
      if (userMessage === 'อัปเดตน้ำหนักส่วนสูง') {
        await updateState(userId, 'UPDATE_WEIGHT', {});
        return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: '秤️ มาอัปเดตน้ำหนักประจำสัปดาห์กันครับ! ตอนนี้น้ำหนักกี่กิโลกรัมครับ? (พิมพ์ตัวเลข เช่น 52.5)' }] });
      }

      if (userMessage === 'ระบุปริมาณน้ำ') {
        await updateState(userId, 'INPUT_WATER', {});
        return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: '💧 พิมพ์ปริมาณน้ำที่คุณดื่มลงไปได้เลยครับ (เป็นตัวเลข มล. เช่น 330)' }] });
      }

      if (userMessage.startsWith('บันทึกน้ำ') || userMessage.startsWith('น้ำ ')) {
        const valStr = userMessage.replace('บันทึกน้ำ', '').replace('น้ำ', '').trim();
        const addedWater = parseInt(valStr) || 250;
        let { data: mLog } = await supabase.from('daily_missions').select('water_accum_ml').eq('user_id', userId).eq('log_date', todayStr).single();
        const newWater = (mLog?.water_accum_ml || 0) + addedWater;
        
        await supabase.from('daily_missions').upsert({ user_id: userId, log_date: todayStr, water_accum_ml: newWater }, { onConflict: 'user_id,log_date' });
        await updateState(userId, 'MAIN_MENU', {});
        return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: `💧 บันทึกน้ำดื่ม +${addedWater} ml เรียบร้อยครับ! (ยอดรวมวันนี้: ${newWater} ml ✨)` }] });
      }

      if (userMessage.startsWith('บันทึกยืดตัว') || userMessage.startsWith('ยืด ')) {
        const valStr = userMessage.replace('บันทึกยืดตัว', '').replace('ยืด', '').trim();
        const addedStretch = parseInt(valStr) || 1;
        let { data: mLog } = await supabase.from('daily_missions').select('stretch_count').eq('user_id', userId).eq('log_date', todayStr).single();
        const newStretch = (addedStretch > 1) ? addedStretch : (mLog?.stretch_count || 0) + addedStretch;

        await supabase.from('daily_missions').upsert({ user_id: userId, log_date: todayStr, stretch_count: newStretch }, { onConflict: 'user_id,log_date' });
        await updateState(userId, 'MAIN_MENU', {});
        return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: `🧘‍♂️ บันทึกการยืดเส้นยืดสายเป็น ${newStretch} ครั้งแล้วครับ ยอดเยี่ยมมากครับ! 👍` }] });
      }

      if (userMessage === 'บันทึกก้าวเดิน') {
        await updateState(userId, 'INPUT_STEPS', {});
        return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: '👟 วันนี้เดินไปได้กี่ก้าวแล้วครับ? พิมพ์ตัวเลขส่งมาได้เลยนะ (เช่น 8500)' }] });
      }

      if (userMessage === 'เช็กอินอารมณ์') {
        await updateState(userId, 'DAILY_MOOD', {});
        return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: '🌤️ วันนี้รู้สึกอย่างไรบ้างครับ? (เช่น สดชื่น, เหนื่อยล้า, เครียดเรื่องเรียน)' }] });
      }
      break;

    case 'UPDATE_WEIGHT':
      const newW = parseFloat(userMessage);
      if (isNaN(newW) || newW <= 0) return replyErr(event, 'โปรดระบุน้ำหนักเป็นตัวเลขครับ');
      currentContext.weight = newW;
      await updateState(userId, 'UPDATE_HEIGHT', currentContext);
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: '📐 และตอนนี้ส่วนสูงกี่เซนติเมตรครับ? (พิมพ์ตัวเลข เช่น 160)' }] });

    case 'UPDATE_HEIGHT':
      const newH = parseFloat(userMessage);
      if (isNaN(newH) || newH <= 0) return replyErr(event, 'โปรดระบุส่วนสูงเป็นตัวเลขครับ');

      await saveUserProfile(
        userId, profile.gender, profile.age, profile.user_type,
        profile.chronic_disease, profile.dietary_restriction,
        profile.lifestyle, currentContext.weight, newH
      );

      await updateState(userId, 'MAIN_MENU', {});
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: `🎉 อัปเดตสัดส่วนเรียบร้อยครับ!\n• น้ำหนัก: ${currentContext.weight} kg\n• ส่วนสูง: ${newH} cm\n\nระบบปรับคำนวณเป้าหมายสุขภาพให้คุณเรียบร้อยครับ ✨` }]
      });

    case 'INPUT_WATER':
      const inputWater = parseInt(userMessage);
      if (isNaN(inputWater) || inputWater <= 0) return replyErr(event, 'โปรดพิมพ์ตัวเลขปริมาณน้ำเป็น มิลลิลิตร ครับ');
      
      const tDateWater = new Date().toISOString().split('T')[0];
      let { data: wLog } = await supabase.from('daily_missions').select('water_accum_ml').eq('user_id', userId).eq('log_date', tDateWater).single();
      const updatedWater = (wLog?.water_accum_ml || 0) + inputWater;

      await supabase.from('daily_missions').upsert({ user_id: userId, log_date: tDateWater, water_accum_ml: updatedWater }, { onConflict: 'user_id,log_date' });
      await updateState(userId, 'MAIN_MENU', {});
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: `💧 เพิ่มน้ำดื่มไป +${inputWater} ml เรียบร้อยครับ! (ยอดรวมวันนี้: ${updatedWater} ml)` }] });

    case 'INPUT_STEPS':
      const steps = parseInt(userMessage);
      if (isNaN(steps) || steps < 0) return replyErr(event, 'โปรดพิมพ์ระบุจำนวนก้าวเป็นตัวเลขครับ');
      
      const tDateSteps = new Date().toISOString().split('T')[0];
      await supabase.from('daily_missions').upsert({ user_id: userId, log_date: tDateSteps, step_count: steps }, { onConflict: 'user_id,log_date' });
      await updateState(userId, 'MAIN_MENU', {});
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: `👟 บันทึกก้าวเดินวันนี้: ${steps} ก้าว เรียบร้อยครับ! ✨` }] });

    // ขั้นตอนลงทะเบียนประวัติสุขภาพ
    case 'REG_GENDER':
      if (userMessage !== 'ชาย' && userMessage !== 'หญิง') return replyErr(event, 'เลือก "ชาย" หรือ "หญิง" จากปุ่มได้เลยครับ');
      currentContext.gender = userMessage;
      await updateState(userId, 'REG_AGE', currentContext);
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ตอนนี้อายุเท่าไหร่แล้วครับ? (พิมพ์เป็นตัวเลข เช่น 16)' }] });

    case 'REG_AGE':
      const age = parseInt(userMessage);
      if (isNaN(age) || age <= 0 || age > 110) return replyErr(event, 'โปรดระบุอายุเป็นตัวเลขครับ');
      currentContext.age = age;

      if (age >= 12 && age <= 18) {
        await updateState(userId, 'REG_STUDENT_LEVEL', currentContext);
        const levelCard = {
          type: "flex", altText: "โปรดเลือกระดับชั้นเรียน",
          contents: {
            type: "bubble",
            header: {
              type: "box", layout: "vertical", backgroundColor: COLORS.PRIMARY,
              contents: [
                { type: "text", text: "🎓 ระดับการศึกษา", color: "#CCFBF1", weight: "bold", size: "xs" },
                { type: "text", text: "ตอนนี้เรียนอยู่ชั้นไหนครับ?", color: COLORS.WHITE, weight: "bold", size: "sm", margin: "xs" }
              ]
            },
            body: {
              type: "box", layout: "vertical",
              contents: [
                { type: "button", style: "primary", color: COLORS.SECONDARY, margin: "xs", action: { type: "message", label: "มัธยมศึกษาตอนต้น", text: "มัธยมศึกษาตอนต้น" } },
                { type: "button", style: "primary", color: "#0284C7", margin: "sm", action: { type: "message", label: "มัธยมศึกษาตอนปลาย", text: "มัธยมศึกษาตอนปลาย" } }
              ]
            }
          }
        };
        return client.replyMessage({ replyToken: event.replyToken, messages: [levelCard] });
      } else {
        currentContext.user_type = 'บุคคลทั่วไป';
        await updateState(userId, 'REG_DISEASE', currentContext);
        return sendDiseaseCard(event);
      }

    case 'REG_STUDENT_LEVEL':
      if (userMessage !== 'มัธยมศึกษาตอนต้น' && userMessage !== 'มัธยมศึกษาตอนปลาย' && userMessage !== 'ม.ต้น' && userMessage !== 'ม.ปลาย') {
        return replyErr(event, 'เลือก "มัธยมศึกษาตอนต้น" หรือ "มัธยมศึกษาตอนปลาย" จากปุ่มได้เลยครับ');
      }
      currentContext.user_type = userMessage;
      await updateState(userId, 'REG_DISEASE', currentContext);
      return sendDiseaseCard(event);

    case 'REG_DISEASE':
      currentContext.chronic_disease = userMessage;
      await updateState(userId, 'REG_DIET', currentContext);
      
      const dietCard = {
        type: "flex", altText: "โปรดเลือกข้อจำกัดทางอาหาร",
        contents: {
          type: "bubble",
          header: {
            type: "box", layout: "vertical", backgroundColor: COLORS.PRIMARY,
            contents: [
              { type: "text", text: "🥗 ข้อจำกัดทางอาหารและการแพ้", color: "#CCFBF1", weight: "bold", size: "xs" },
              { type: "text", text: "คุณมีข้อจำกัดหรืออาการแพ้อาหารไหมครับ?", color: COLORS.WHITE, weight: "bold", size: "sm", margin: "xs" }
            ]
          },
          body: {
            type: "box", layout: "vertical",
            contents: [
              { type: "button", style: "primary", color: COLORS.SECONDARY, margin: "xs", action: { type: "message", label: "❌ ทานได้หมดทุกอย่าง", text: "ไม่มี" } },
              { type: "button", style: "primary", color: "#0284C7", margin: "sm", action: { type: "message", label: "🌙 อิสลาม / ฮาลาล", text: "อิสลาม/ฮาลาล" } },
              { type: "button", style: "primary", color: "#10B981", margin: "sm", action: { type: "message", label: "🌱 มังสวิรัติ / วีแกน", text: "มังสวิรัติ/วีแกน" } },
              { type: "button", style: "primary", color: "#D97706", margin: "sm", action: { type: "message", label: "🦐 แพ้อาหารทะเล", text: "แพ้อาหารทะเล" } },
              { type: "button", style: "primary", color: "#B45309", margin: "sm", action: { type: "message", label: "🥜 แพ้ถั่วชนิดต่างๆ", text: "แพ้ถั่ว" } },
              { type: "button", style: "primary", color: "#4B5563", margin: "sm", action: { type: "message", label: "🥛 แพ้นม / แลกโตส", text: "แพ้นม/แลกโตส" } }
            ]
          }
        }
      };
      return client.replyMessage({ replyToken: event.replyToken, messages: [dietCard] });

    case 'REG_DIET':
      currentContext.dietary_restriction = userMessage;
      await updateState(userId, 'REG_LIFESTYLE', currentContext);
      
      const lifestyleCard = {
        type: "flex", altText: "โปรดเลือกพฤติกรรมการใช้ชีวิต",
        contents: {
          type: "bubble",
          header: {
            type: "box", layout: "vertical", backgroundColor: COLORS.PRIMARY,
            contents: [
              { type: "text", text: "🏃‍♂️ พฤติกรรมและวิถีชีวิต", color: "#CCFBF1", weight: "bold", size: "xs" },
              { type: "text", text: "พฤติกรรมการใช้ชีวิตปกติเป็นแบบไหนครับ?", color: COLORS.WHITE, weight: "bold", size: "sm", margin: "xs" }
            ]
          },
          body: {
            type: "box", layout: "vertical",
            contents: [
              { type: "button", style: "primary", color: "#0284C7", margin: "xs", action: { type: "message", label: "🖥️ นั่งเรียน/ทำงานส่วนใหญ่", text: "นั่งทำงานทั่วไป" } },
              { type: "button", style: "primary", color: "#0284C7", margin: "sm", action: { type: "message", label: "🏃 เคลื่อนไหวบ่อย/ออกกำลัง", text: "ทำงานหนักใช้แรง" } },
              { type: "button", style: "primary", color: "#DC2626", margin: "sm", action: { type: "message", label: "🚬 สูบบุหรี่/ดื่มสุราประจำ", text: "สูบบุหรี่/ดื่มสุราประจำ" } }
            ]
          }
        }
      };
      return client.replyMessage({ replyToken: event.replyToken, messages: [lifestyleCard] });

    case 'REG_LIFESTYLE':
      currentContext.lifestyle = userMessage;
      await updateState(userId, 'REG_WEIGHT', currentContext);
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'น้ำหนักกี่กิโลกรัมครับ? (พิมพ์เป็นตัวเลข เช่น 52)' }] });

    case 'REG_WEIGHT':
      const w = parseFloat(userMessage);
      if (isNaN(w) || w <= 0) return replyErr(event, 'โปรดพิมพ์ตัวเลขน้ำหนักครับ');
      currentContext.weight = w;
      await updateState(userId, 'REG_HEIGHT', currentContext);
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ส่วนสูงกี่เซนติเมตรครับ? (พิมพ์เป็นตัวเลข เช่น 160)' }] });

    case 'REG_HEIGHT':
      const h = parseFloat(userMessage);
      if (isNaN(h) || h <= 0) return replyErr(event, 'โปรดพิมพ์ตัวเลขส่วนสูงครับ');
      
      await saveUserProfile(
        userId, currentContext.gender, currentContext.age, currentContext.user_type || 'บุคคลทั่วไป',
        currentContext.chronic_disease, currentContext.dietary_restriction || 'ไม่มี',
        currentContext.lifestyle, currentContext.weight, h
      );
      await updateState(userId, 'MAIN_MENU', {});
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'บันทึกประวัติสุขภาพเรียบร้อยครับ! ✨\n\n' + mainMenuText }] });

    case 'DAILY_MOOD':
      currentContext.mood = userMessage;
      await updateState(userId, 'DAILY_SYMPTOM', currentContext);
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'วันนี้มีอาการป่วยหรือเมื่อยล้าตรงไหนไหมครับ? (ถ้าสบายดีพิมพ์ว่า "ไม่มี" ได้เลย)' }] });

    case 'DAILY_SYMPTOM':
      const todayDate = new Date().toISOString().split('T')[0];
      await supabase.from('daily_progress').upsert({
        user_id: userId, log_date: todayDate, mood_today: currentContext.mood, symptoms_today: userMessage
      }, { onConflict: 'user_id,log_date' });

      await updateState(userId, 'MAIN_MENU', {});
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: `รับทราบครับ! บันทึกเรียบร้อยครับ ✨\n\n` + mainMenuText }] });

    // 🔍 ค้นหาโภชนาการ (ปรับแก้ไม่ให้เด้งหลุดไปหน้าหลักเมื่อพิมพ์คำผิด/ไม่พบเมนู)
    case 'SEARCH_NUTRIENT':
      try {
        let searchKey = userMessage.trim();
        let currentOffset = currentContext.offset || 0;

        if (userMessage.startsWith('ค้นหาเพิ่ม:')) {
          const parts = userMessage.split(':');
          searchKey = parts[1] || '';
          currentOffset = parseInt(parts[2]) || 0;
        }

        let { data: matchedMenus, count, error } = await supabase
          .from('canteen_menus')
          .select('*', { count: 'exact' })
          .ilike('menu_name', `%${searchKey}%`)
          .range(currentOffset, currentOffset + 2);

        if (error) {
          console.error('Supabase Search Error:', error);
          return client.replyMessage({ 
            replyToken: event.replyToken, 
            messages: [{ type: 'text', text: `❌ เกิดข้อผิดพลาดในการค้นหา ลองพิมพ์ค้นชื่อเมนูใหม่อีกครั้งได้เลยครับ\n(หรือพิมพ์ "เมนูหลัก" เพื่อยกเลิก)` }] 
          });
        }

        if (matchedMenus && matchedMenus.length > 0) {
          const bubbles = matchedMenus.map((meal) => {
            const menuName = String(meal.menu_name || 'เมนูอาหาร');
            const cal = String(meal.calories ?? '-');
            const carbs = String(meal.carbs ?? '-');
            const protein = String(meal.protein ?? '-');
            const fat = String(meal.fat ?? '-');

            return {
              type: "bubble",
              header: {
                type: "box", layout: "vertical", backgroundColor: COLORS.PRIMARY,
                contents: [
                  { type: "text", text: menuName, weight: "bold", size: "md", color: COLORS.WHITE, wrap: true },
                  { type: "text", text: `🔥 พลังงาน: ${cal} kcal`, size: "xs", color: "#CCFBF1", margin: "xs" }
                ]
              },
              body: {
                type: "box", layout: "vertical",
                contents: [
                  { type: "text", text: `🍞 คาร์โบไฮเดรต: ${carbs} g`, size: "xs", color: "#4B5563" },
                  { type: "text", text: `🥩 โปรตีน: ${protein} g`, size: "xs", color: "#4B5563", margin: "xs" },
                  { type: "text", text: `🥑 ไขมัน: ${fat} g`, size: "xs", color: "#4B5563", margin: "xs" }
                ]
              }
            };
          });

          const nextOffset = currentOffset + matchedMenus.length;
          const totalCount = count || 0;

          if (totalCount > nextOffset) {
            bubbles.push({
              type: "bubble",
              body: {
                type: "box", layout: "vertical", justifyContent: "center", alignItems: "center",
                contents: [
                  { type: "text", text: `ยังมีเมนู "${searchKey}" อีก ${totalCount - nextOffset} เมนู`, size: "xs", color: "#6B7280", wrap: true },
                  { 
                    type: "button", style: "primary", color: COLORS.SECONDARY, margin: "md",
                    action: { type: "message", label: "🔍 ดูเมนูอื่นเพิ่มเติม", text: `ค้นหาเพิ่ม:${searchKey}:${nextOffset}` } 
                  }
                ]
              }
            });
          }

          await updateState(userId, 'SEARCH_NUTRIENT', { offset: currentOffset, key: searchKey });
          return client.replyMessage({ 
            replyToken: event.replyToken, 
            messages: [{ 
              type: "flex", 
              altText: `ผลการค้นหา ${searchKey}`, 
              contents: { type: "carousel", contents: bubbles } 
            }] 
          });
        } else {
          // 💡 คงสถานะ SEARCH_NUTRIENT ไว้ ผู้ใช้จะได้พิมพ์ค้นใหม่ได้เลยทันที
          return client.replyMessage({ 
            replyToken: event.replyToken, 
            messages: [{ type: 'text', text: `❌ ไม่พบเมนูที่ชื่อ "${searchKey}" ครับ\n\n🔍 ลองพิมพ์ค้นหาด้วยคำสั้นๆ หรือชื่อเมนูอื่นได้เลยครับ!\n(หรือพิมพ์ "เมนูหลัก" เพื่อกลับหน้าหลัก)` }] 
          });
        }
      } catch (err) {
        console.error('SEARCH_NUTRIENT Error:', err);
        return client.replyMessage({ 
          replyToken: event.replyToken, 
          messages: [{ type: 'text', text: '⚠️ เกิดข้อผิดพลาด ลองพิมพ์ค้นชื่อเมนูใหม่อีกครั้งนะครับ\n(หรือพิมพ์ "เมนูหลัก" เพื่อกลับหน้าหลัก)' }] 
        });
      }

    // แบบทดสอบสุขภาพจิต
    case 'MONTHLY_MENTAL':
      const validScores = ['0', '1', '2', '3'];
      if (!validScores.includes(userMessage)) return replyErr(event, 'เลือกกดจากปุ่มได้เลยครับ');

      const qIdx = currentContext.current_q;
      currentContext.scores[qIdx] = parseInt(userMessage);
      const nextIdx = qIdx + 1;

      if (nextIdx <= MENTAL_QUESTIONS.length) {
        currentContext.current_q = nextIdx;
        await updateState(userId, 'MONTHLY_MENTAL', currentContext);
        return sendMentalQuestion(event, nextIdx, '');
      } else {
        let totalScore = 0;
        for (const id in currentContext.scores) { totalScore += currentContext.scores[id]; }
        let mentalResult = totalScore <= 5 ? "อยู่ในช่วงตึงเครียด แนะนำหาเวลาผ่อนคลายความเหนื่อยล้าดูนะครับ 💚" : "สุขภาพใจดี มีความสมดุลเยี่ยมครับ! 🌟";
        
        await supabase.from('mental_health_scores').insert({ user_id: userId, total_score: totalScore, result_text: mentalResult });
        await updateState(userId, 'MAIN_MENU', {});

        const mentalResultCard = {
          type: "flex", altText: "🧠 รายงานผลการประเมินสุขภาพจิต",
          contents: {
            type: "bubble",
            header: {
              type: "box", layout: "vertical", backgroundColor: COLORS.PRIMARY,
              contents: [
                { type: "text", text: "🧠 รายงานผลประเมินสุขภาพจิต", weight: "bold", size: "md", color: COLORS.WHITE },
                { type: "text", text: "ประเมินสุขภาพใจล่าสุด", size: "xs", color: "#CCFBF1", margin: "xs" }
              ]
            },
            body: {
              type: "box", layout: "vertical",
              contents: [
                { type: "text", text: `คะแนนสะสมรวม: ${totalScore} / 15 คะแนน`, size: "sm", color: COLORS.NEUTRAL_DARK, weight: "bold" },
                { type: "separator", margin: "md" },
                { type: "text", text: "📊 สรุปผลการประเมิน:", size: "xs", color: "#6B7280", margin: "md" },
                { type: "text", text: mentalResult, size: "sm", color: COLORS.PRIMARY, weight: "bold", wrap: true, margin: "xs" }
              ]
            }
          }
        };

        return client.replyMessage({
          replyToken: event.replyToken,
          messages: [
            mentalResultCard,
            { type: 'text', text: mainMenuText }
          ]
        });
      }
  }

  if (currentState === 'MAIN_MENU') {
    return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: mainMenuText }] });
  }
}

function sendDiseaseCard(event) {
  const diseaseCard = {
    type: "flex", altText: "โปรดเลือกโรคประจำตัว",
    contents: {
      type: "bubble",
      header: {
        type: "box", layout: "vertical", backgroundColor: COLORS.PRIMARY,
        contents: [
          { type: "text", text: "🩺 โรคประจำตัว", color: "#CCFBF1", weight: "bold", size: "xs" },
          { type: "text", text: "คุณมีโรคประจำตัวอะไรบ้างไหมครับ?", color: COLORS.WHITE, weight: "bold", size: "md", margin: "xs" }
        ]
      },
      body: {
        type: "box", layout: "vertical",
        contents: [
          { type: "button", style: "primary", color: COLORS.SECONDARY, margin: "xs", action: { type: "message", label: "❌ ไม่มีโรคประจำตัว", text: "ไม่มี" } },
          { type: "button", style: "primary", color: "#4B5563", margin: "sm", action: { type: "message", label: "🩸 เบาหวาน", text: "เบาหวาน" } },
          { type: "button", style: "primary", color: "#4B5563", margin: "sm", action: { type: "message", label: "🩺 ความดันโลหิตสูง", text: "ความดันโลหิตสูง" } },
          { type: "button", style: "primary", color: "#4B5563", margin: "sm", action: { type: "message", label: "🟡 ไขมันในเลือดสูง", text: "ไขมันในเลือดสูง" } },
          { type: "button", style: "primary", color: "#4B5563", margin: "sm", action: { type: "message", label: "🫀 โรคหัวใจ / โรคไต / หอบหืด", text: "โรคหัวใจ/ไต/หอบหืด" } }
        ]
      }
    }
  };
  return client.replyMessage({ replyToken: event.replyToken, messages: [diseaseCard] });
}

function getGenderFlexCard(title) {
  return {
    type: "flex", altText: "โปรดเลือกเพศของคุณ",
    contents: {
      type: "bubble",
      header: {
        type: "box", layout: "vertical", backgroundColor: COLORS.PRIMARY,
        contents: [
          { type: "text", text: "👤 ลงทะเบียนประวัติ", color: "#CCFBF1", weight: "bold", size: "xs" },
          { type: "text", text: title, color: COLORS.WHITE, weight: "bold", size: "sm", margin: "xs", wrap: true }
        ]
      },
      body: {
        type: "box", layout: "vertical",
        contents: [
          { type: "button", style: "primary", color: COLORS.SECONDARY, margin: "xs", action: { type: "message", label: "🙋‍♂️ ชาย", text: "ชาย" } },
          { type: "button", style: "primary", color: "#0284C7", margin: "md", action: { type: "message", label: "🙋‍♀️ หญิง", text: "หญิง" } }
        ]
      }
    }
  };
}

function sendMentalQuestion(event, qId, prefix) {
  const question = MENTAL_QUESTIONS.find(q => q.id === qId);
  return client.replyMessage({
    replyToken: event.replyToken,
    messages: [{
      type: 'text', text: `${prefix}📋 ${question.text}`,
      quickReply: {
        items: [
          { type: 'action', action: { type: 'message', label: '❌ ไม่เลย (0)', text: '0' } },
          { type: 'action', action: { type: 'message', label: '📉 เล็กน้อย (1)', text: '1' } },
          { type: 'action', action: { type: 'message', label: '📊 มาก (2)', text: '2' } },
          { type: 'action', action: { type: 'message', label: '📈 มากที่สุด (3)', text: '3' } }
        ]
      }
    }]
  });
}

async function updateState(userId, state, context) {
  await supabase.from('user_states').upsert({ user_id: userId, state, context }, { onConflict: 'user_id' });
}

function replyErr(event, msg) {
  return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: '⚠️ ' + msg }] });
}

async function saveUserProfile(userId, gender, age, user_type, chronic_disease, dietary_restriction, lifestyle, weight, height) {
  const heightMeter = height / 100;
  const bmi = parseFloat((weight / (heightMeter * heightMeter)).toFixed(1));
  let bmr = (gender === 'ชาย') ? (10 * weight + 6.25 * height - 5 * age + 5) : (10 * weight + 6.25 * height - 5 * age - 161);
  bmr = isNaN(bmr) ? 1500 : Math.round(bmr);
  const tdee = Math.round(bmr * 1.375);

  const target_water_ml = Math.round(weight * 33);
  let target_steps = 10000;
  if (bmi < 18.5) target_steps = 8000;
  else if (bmi >= 23.0) target_steps = 11000;

  await supabase.from('user_profiles').upsert({
    user_id: userId, gender, age, user_type, chronic_disease, dietary_restriction, lifestyle, weight, height, bmi, bmr, tdee, target_water_ml, target_steps
  }, { onConflict: 'user_id' });
}

app.listen(process.env.PORT || 3000, () => {
  console.log('Server running with persistent search state & daily cron notifications!');
});