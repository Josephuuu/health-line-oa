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

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const app = express();

// คลังข้อมูลเมนูอาหารที่มีขายในโรงอาหาร (แบ่งตามประเภทและแคลอรีเพื่อใช้ในระบบคัดกรอง)
const CANTEEN_MENU = [
  { name: 'เกาเหลาน้ำใสหมูสับ/อกไก่', cals: 180, tags: ['low-fat', 'low-carb'], sodium: 'medium' },
  { name: 'ต้มจืดเต้าหู้หมูสับวุ้นเส้น', cals: 200, tags: ['low-fat'], sodium: 'low' },
  { name: 'แกงส้มผักรวม (ไม่ใส่ชะอมทอด)', cals: 120, tags: ['low-fat', 'no-oil'], sodium: 'high' },
  { name: 'ผัดกะเพราอกไก่ (น้ำมันน้อย) + ข้าวกล้อง', cals: 380, tags: ['high-protein'], sodium: 'medium' },
  { name: 'ข้าวต้มปลา/ไก่', cals: 250, tags: ['easy-digest', 'low-fat'], sodium: 'medium' },
  { name: 'ส้มตำไทย (หวานน้อย) + ไก่ย่างไม่ติดหนัง', cals: 280, tags: ['spicy', 'low-fat'], sodium: 'high' },
  { name: 'ข้าวมันไก่เนื้ออกล้วนไม่หนัง (ข้าวสวยธรรมดา)', cals: 350, tags: ['high-protein'], sodium: 'medium' },
  { name: 'สลัดผักอกไก่ (น้ำสลัดใส)', cals: 220, tags: ['high-fiber', 'low-fat'], sodium: 'low' }
];

// รายการคำถามสุขภาพจิต 5 ข้อ (ขยายเพิ่มทีหลังได้ตามต้องการ)
const MENTAL_QUESTIONS = [
  { id: 1, text: "1. ท่านรู้สึกพึงพอใจในชีวิต" },
  { id: 2, text: "2. ท่านรู้สึกสบายใจ" },
  { id: 3, text: "3. ท่านรู้สึกสดชื่นเบิกบานใจ" },
  { id: 4, text: "4. ท่านรู้สึกชีวิตของท่านมีความสุขสงบ" },
  { id: 5, text: "5. ท่านรู้สึกเบื่อหน่ายท้อแท้กับการดำเนินชีวิตประจำวัน" }
];

app.get('/', (req, res) => res.send('Advanced Health Bot is running!'));

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

  const userId = event.source.userId;
  const userMessage = event.message.text.trim();

  // ดึงสถานะปัจจุบัน
  let { data: stateData } = await supabase.from('user_states').select('state, context').eq('user_id', userId).single();
  let currentState = stateData ? stateData.state : 'MAIN_MENU';
  let currentContext = stateData && stateData.context ? stateData.context : {};

  if (!stateData) {
    await supabase.from('user_states').insert({ user_id: userId, state: 'MAIN_MENU', context: {} });
    currentState = 'MAIN_MENU';
  }

  // ข้อความเมนูหลักมาตรฐานแบบ 4 ฟีเจอร์หลัก
  const mainMenuText = `🤖 เมนูหลักระบบดูแลสุขภาพอัจฉริยะ:\n\n` +
                       `1️⃣ [ลงทะเบียนประวัติ] - (กรอกข้อมูลและพฤติกรรมครั้งแรก)\n` +
                       `2️⃣ [อัปเดตน้ำหนัก/ส่วนสูง] - (อัปเดตค่า BMI และ BMR ล่าสุด)\n` +
                       `3️⃣ [บันทึกประจำวัน + ตรวจสุขภาพจิต]\n` +
                       `4️⃣ [แนะนำอาหารลดน้ำหนักในโรงอาหาร]\n\n` +
                       `👉 พิมพ์หมายเลข หรือพิมพ์ "เมนูหลัก" เพื่อเปิดเมนูนี้ได้ตลอดเวลาครับ`;

  // คำสั่ง Global พากลับบ้าน
  if (userMessage === 'กลับหน้าหลัก' || userMessage === 'เมนูหลัก' || userMessage === 'เมนู') {
    await supabase.from('user_states').upsert({ user_id: userId, state: 'MAIN_MENU', context: {} }, { onConflict: 'user_id' });
    return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: mainMenuText }] });
  }

  // ==========================================
  // 📥 SECTION 1: ดักรับคำสั่งเฉพาะตอนอยู่หน้า MAIN_MENU
  // ==========================================
  if (currentState === 'MAIN_MENU') {
    
    // เมนู 1: เริ่มขั้นตอนลงทะเบียนแบบจัดเต็ม
    if (userMessage === '1' || userMessage.includes('ลงทะเบียน')) {
      await updateState(userId, 'REG_GENDER', {});
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{
          type: 'text',
          text: 'เริ่มลงทะเบียนข้อมูลสุขภาพครับ\n\nโปรดเลือก เพศ ของคุณ:',
          quickReply: {
            items: [
              { type: 'action', action: { type: 'message', label: '🙋‍♂️ ชาย', text: 'ชาย' } },
              { type: 'action', action: { type: 'message', label: '🙋‍♀️ หญิง', text: 'หญิง' } }
            ]
          }
        }]
      });
    }

    // เมนู 2: อัปเดตสัดส่วนร่างกาย (ทำซ้ำได้เรื่อย ๆ)
    if (userMessage === '2' || userMessage.includes('อัปเดตน้ำหนัก')) {
      await updateState(userId, 'UPDATE_WEIGHT', {});
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: '🔄 โหมดอัปเดตสัดส่วนร่างกาย\n\nโปรดพิมพ์ น้ำหนัก ปัจจุบันของคุณ (กก.) เป็นตัวเลขเช่น 68.5' }] });
    }

    // เมนู 3: บันทึกข้อมูลประจำวัน + วิ่งต่อไปทำข้อสอบสุขภาพจิต
    if (userMessage === '3' || userMessage.includes('บันทึกประจำวัน')) {
      await updateState(userId, 'DAILY_MOOD', {});
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{
          type: 'text',
          text: '🌤️ [บันทึกสุขภาพรายวัน: ขั้นที่ 1/3]\n\nวันนี้คุณรู้สึกอย่างไรบ้างครับ? (เลือกปุ่มด้านล่าง)',
          quickReply: {
            items: [
              { type: 'action', action: { type: 'message', label: '😊 สดชื่น/มีความสุข', text: 'มีความสุข' } },
              { type: 'action', action: { type: 'message', label: '😐 ปกติ/เฉยๆ', text: 'ปกติ' } },
              { type: 'action', action: { type: 'message', label: '😴 เพลีย/เหนื่อยล้า', text: 'เหนื่อยล้า' } },
              { type: 'action', action: { type: 'message', label: '😫 เครียด/กังวล', text: 'เครียด' } }
            ]
          }
        }]
      });
    }

    // เมนู 4: แนะนำอาหารโรงอาหารวิเคราะห์ตาม BMR และสภาวะร่างกาย
    if (userMessage === '4' || userMessage.includes('อาหาร')) {
      let { data: profile } = await supabase.from('user_profiles').select('*').eq('user_id', userId).single();
      if (!profile) {
        return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: '⚠️ ไม่พบข้อมูลร่างกายของคุณ กรุณากดเมนู 1 เพื่อลงทะเบียนประวัติก่อนนะครับ' }] });
      }

      // คำนวณขอบเขตแคลอรีต่อมื้อเพื่อลดน้ำหนัก (TDEE ลบออก 500 หาร 3 มื้อ)
      const tdee = profile.tdee || 2000;
      const budgetPerMeal = Math.round((tdee - 500) / 3);

      // กรองเมนูอาหารในคลังที่แคลอรีไม่เกิน Budget
      let fitMenus = CANTEEN_MENU.filter(m => m.cals <= budgetPerMeal);
      if (fitMenus.length === 0) fitMenus = CANTEEN_MENU; // fallback

      // สุ่มเลือกเมนูอาหารมานำเสนอให้ 3 เมนูเพื่อไม่ให้ซ้ำซาก
      const shuffled = fitMenus.sort(() => 0.5 - Math.random());
      const selectedMenus = shuffled.slice(0, 3);

      let foodResponse = `🏪 [ระบบวิเคราะห์เมนูอาหารโรงอาหารเพื่อลดน้ำหนัก]\n`;
      foodResponse += `📊 พลังงานแนะนำมื้อนี้ของคุณ: ไม่เกิน **${budgetPerMeal} kcal**\n`;
      foodResponse += `🩺 ข้อมูลสัญญานชีพ: โรคประจำตัว: ${profile.chronic_disease} | พฤติกรรม: ${profile.lifestyle}\n`;
      foodResponse += `-------------------------------------\n\n`;
      foodResponse += `🥗 เมนูโรงอาหารที่เหมาะกับคุณวันนี้:\n`;

      selectedMenus.forEach((menu, index) => {
        foodResponse += `${index + 1}. ${menu.name} (~${menu.cals} kcal)\n`;
      });

      // แจ้งเตือนอัจฉริยะตามประวัติโรคประจำตัว
      if (profile.chronic_disease.includes('ความดัน') || profile.chronic_disease.includes('หัวใจ')) {
        foodResponse += `\n⚠️ *ข้อแนะนำพิเศษ*: เนื่องจากคุณมีสภาวะความดัน/โรคหัวใจ อาหารประเภทก๋วยเตี๋ยวหรือแกงส้ม แนะนำให้ "เลี่ยงการซดน้ำซุป" เพื่อลดปริมาณโซเดียมสะสมนะครับ`;
      }
      if (profile.lifestyle.includes('สูบบุหรี่') || profile.lifestyle.includes('ดื่ม')) {
        foodResponse += `\n🚬 *ข้อแนะนำพฤติกรรม*: ช่วงลดน้ำหนัก ควรงดดื่มเครื่องดื่มแอลกอฮอล์เพราะให้แคลอรีสูงมาก และดื่มน้ำเปล่าเพิ่มขึ้นทดแทนนะครับ`;
      }

      foodResponse += `\n\n🏠 พิมพ์ "เมนูหลัก" เพื่อกลับสู่หน้าเลือกรายการ`;
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: foodResponse }] });
    }
  }

  // ==========================================
  // ⚡ SECTION 2: STATE MACHINE (ระบบจัดการกระบวนการแยกห้อง)
  // ==========================================
  switch (currentState) {
    
    // ------ 🔴 FLOW 1: ลงทะเบียนผู้ใช้ใหม่ ------
    case 'REG_GENDER':
      if (userMessage !== 'ชาย' && userMessage !== 'หญิง') return replyErr(event, 'โปรดกดปุ่มเลือก "ชาย" หรือ "หญิง" เท่านั้นครับ');
      currentContext.gender = userMessage;
      await updateState(userId, 'REG_AGE', currentContext);
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'อายุของคุณกี่ปีครับ? (โปรดระบุเป็นตัวเลขเท่านั้น เช่น 20)' }] });

    case 'REG_AGE':
      const age = parseInt(userMessage);
      if (isNaN(age) || age <= 0 || age > 110) return replyErr(event, 'โปรดพิมพ์ระบุอายุเป็นตัวเลขที่ถูกต้องครับ');
      currentContext.age = age;
      await updateState(userId, 'REG_DISEASE', currentContext);
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{
          type: 'text',
          text: 'คุณมีโรคประจำตัวหรือไม่? (เลือกปุ่มด่วน หรือพิมพ์ระบุเองได้เลย)',
          quickReply: {
            items: [
              { type: 'action', action: { type: 'message', label: '✅ ไม่มีโรคประจำตัว', text: 'ไม่มี' } },
              { type: 'action', action: { type: 'message', label: '🩺 โรคความดันโลหิตสูง', text: 'ความดันโลหิตสูง' } },
              { type: 'action', action: { type: 'message', label: '🩸 โรคเบาหวาน', text: 'เบาหวาน' } },
              { type: 'action', action: { type: 'message', label: '🫀 โรคหัวใจ', text: 'โรคหัวใจ' } }
            ]
          }
        }]
      });

    case 'REG_DISEASE':
      currentContext.chronic_disease = userMessage;
      await updateState(userId, 'REG_LIFESTYLE', currentContext);
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{
          type: 'text',
          text: 'พฤติกรรมการดำเนินชีวิตส่วนใหญ่ของคุณเป็นอย่างไรมากที่สุดครับ?',
          quickReply: {
            items: [
              { type: 'action', action: { type: 'message', label: '🖥️ นั่งทำงานออฟฟิศ/เรียน', text: 'นั่งโต๊ะทำงานทั่วไป' } },
              { type: 'action', action: { type: 'message', label: '🛠️ ทำงานหนัก/ยกของหนัก', text: 'ทำงานหนักใช้แรง' } },
              { type: 'action', action: { type: 'message', label: '🍺 ดื่มสังสรรค์/สูบบุหรี่', text: 'สูบบุหรี่หรือดื่มแอลกอฮอล์' } }
            ]
          }
        }]
      });

    case 'REG_LIFESTYLE':
      currentContext.lifestyle = userMessage;
      await updateState(userId, 'REG_WEIGHT', currentContext);
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ขอทราบ น้ำหนัก ตัวปัจจุบันของคุณ (กิโลกรัม) ตัวเลขเท่านั้นครับ:' }] });

    case 'REG_WEIGHT':
      const w = parseFloat(userMessage);
      if (isNaN(w) || w <= 0) return replyErr(event, 'กรุณากรอกน้ำหนักตัวเป็นตัวเลขที่ถูกต้องครับ');
      currentContext.weight = w;
      await updateState(userId, 'REG_HEIGHT', currentContext);
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ขอทราบ ส่วนสูง ปัจจุบันของคุณ (เซนติเมตร) ตัวเลขเท่านั้นครับ:' }] });

    case 'REG_HEIGHT':
      const h = parseFloat(userMessage);
      if (isNaN(h) || h <= 0) return replyErr(event, 'กรุณากรอกส่วนสูงเป็นตัวเลขที่ถูกต้องครับ');
      
      await saveUserProfile(userId, currentContext.gender, currentContext.age, currentContext.chronic_disease, currentContext.lifestyle, currentContext.weight, h);
      await updateState(userId, 'MAIN_MENU', {});
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: '🎉 ยอดเยี่ยม! ลงทะเบียนข้อมูลและจัดตั้งฐานประวัติสุขภาพของคุณสำเร็จแล้วครับ\n\n' + mainMenuText }] });


    // ------ 🟢 FLOW 2: อัปเดตเฉพาะสัดส่วนทางกายภาพ ------
    case 'UPDATE_WEIGHT':
      const uw = parseFloat(userMessage);
      if (isNaN(uw) || uw <= 0) return replyErr(event, 'กรุณากรอกน้ำหนักตัวเป็นตัวเลขที่ถูกต้องครับ');
      currentContext.weight = uw;
      await updateState(userId, 'UPDATE_HEIGHT', currentContext);
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'โปรดพิมพ์ระบุ ส่วนสูง ปัจจุบันของคุณ (ซม.) ตัวเลขเท่านั้นครับ:' }] });

    case 'UPDATE_HEIGHT':
      const uh = parseFloat(userMessage);
      if (isNaN(uh) || uh <= 0) return replyErr(event, 'กรุณากรอกส่วนสูงเป็นตัวเลขที่ถูกต้องครับ');
      
      let { data: currentProf } = await supabase.from('user_profiles').select('*').eq('user_id', userId).single();
      if (currentProf) {
        await saveUserProfile(userId, currentProf.gender, currentProf.age, currentProf.chronic_disease, currentProf.lifestyle, currentContext.weight, uh);
      } else {
        await saveUserProfile(userId, 'ไม่ระบุ', 0, 'ไม่มี', 'ทั่วไป', currentContext.weight, uh);
      }
      await updateState(userId, 'MAIN_MENU', {});
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: '💪 เปลี่ยนแปลงค่าสัดส่วน อัปเดตดัชนีมวลกาย (BMI) และพลังงานเผาผลาญใหม่เรียบร้อยครับ!\n\n' + mainMenuText }] });


    // ------ 🔵 FLOW 3: บันทึกข้อมูลประจำวัน + วิ่งพุ่งตรงเข้าแบบทดสอบสุขภาพจิต ------
    case 'DAILY_MOOD':
      currentContext.mood = userMessage;
      await updateState(userId, 'DAILY_SYMPTOM', currentContext);
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: '🩺 [บันทึกสุขภาพรายวัน: ขั้นที่ 2/3]\n\nวันนี้มีอาการผิดปกติทางร่างกายใดบ้างไหมครับ? (เช่น ปวดหัว, ไอ, มีไข้, แน่นหน้าอก หรือถ้าปกติดี พิมพ์ตอบว่า "ไม่มี")' }] });

    case 'DAILY_SYMPTOM':
      currentContext.symptom = userMessage;
      // ล็อกสเตตัสกระโดดเข้าสู่ขั้นตอนที่ 3: "แบบทดสอบสุขภาพจิตต่อเนื่อง" ทันที
      currentContext.current_q = 1;
      currentContext.scores = {};
      await updateState(userId, 'MENTAL_FLOW_IN_DAILY', currentContext);
      
      // ส่งคำถามสุขภาพจิตข้อที่ 1 ประเดิมกระบวนการ
      return sendMentalQuestion(event, 1, '🧠 [บันทึกสุขภาพรายวัน: ขั้นที่ 3/3]\nเพื่อการประเมินที่สมบูรณ์ มาตรวจเช็กสภาวะจิตใจกันต่อเลยครับ!\n\n');

    case 'MENTAL_FLOW_IN_DAILY':
      const validScores = ['0', '1', '2', '3'];
      if (!validScores.includes(userMessage)) {
        return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: '⚠️ โปรดเลือกตอบจากปุ่มตัวเลือกด่วนด้านล่างเท่านั้นครับ เพื่อป้องกันระบบขัดข้อง' }] });
      }

      const currentQ = currentContext.current_q;
      currentContext.scores[currentQ] = parseInt(userMessage);
      const nextQ = currentQ + 1;

      if (nextQ <= MENTAL_QUESTIONS.length) {
        currentContext.current_q = nextQ;
        await updateState(userId, 'MENTAL_FLOW_IN_DAILY', currentContext);
        return sendMentalQuestion(event, nextQ, '');
      } else {
        // คำนวณผลคะแนนทดสอบสุขภาพจิต
        let totalScore = 0;
        for (const qId in currentContext.scores) {
          totalScore += currentContext.scores[qId];
        }

        let resultText = totalScore <= 5 ? "🚨 มีสภาวะความเสี่ยงด้านสุขภาพจิตใจสะสม" : "🟢 จิตใจอยู่ในเกณฑ์ปกติ สดชื่นแจ่มใส";
        let adviceText = totalScore <= 5 
          ? "💡 คำแนะนำ: ช่วงนี้คุณอาจมีภาวะกดดันหรือเครียดเงียบ แนะนำให้หักห้ามการนอนดึก ลองดื่มน้ำเย็นพักผ่อนหย่อนใจ หรือใช้ระบบพิมพ์คุยระบายเพื่อผ่อนคลายได้ครับ"
          : "💡 คำแนะนำ: รักษาสมดุลอารมณ์และเกราะความคิดที่ดีแบบนี้ต่อไปเรื่อย ๆ นะครับ เก่งมากครับ!";

        const todayStr = new Date().toISOString().split('T')[0];

        // 1. บันทึกประวัติอาการและอารมณ์ลง daily_progress (Upsert ป้องกันคีย์ซ้ำในวันเดียวกัน)
        await supabase.from('daily_progress').upsert({
          user_id: userId,
          log_date: todayStr,
          mood_today: currentContext.mood,
          symptoms_today: currentContext.symptom
        }, { onConflict: 'user_id,log_date' });

        // 2. บันทึกผลสอบสุขภาพจิตลงฐานข้อมูลตารางคะแนน
        await supabase.from('mental_health_scores').insert({
          user_id: userId, total_score: totalScore, result_text: resultText
        });

        // 3. รีเซ็ตสถานะผู้ใช้กลับไปสู่หน้าเมนูหลัก
        await updateState(userId, 'MAIN_MENU', {});

        let finalSummary = `📝 [สรุปการบันทึกข้อมูลสุขภาพครบวงจรประจำวันนี้]\n` +
                           `------------------------------------\n` +
                           `🌤️ สภาวะอารมณ์: ${currentContext.mood}\n` +
                           `🩺 อาการทางกาย: ${currentContext.symptom}\n` +
                           `🧠 คะแนนตรวจสุขภาพใจ: ${totalScore} คะแนน\n` +
                           `🔍 ผลวิเคราะห์จิตใจ: ${resultText}\n\n` +
                           `${adviceText}\n\n` +
                           `🎉 ระบบบันทึกข้อมูลทั้งหมดลงโปรไฟล์คุณเรียบร้อยแล้วครับ!\n\n` + mainMenuText;

        return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: finalSummary }] });
      }
  }

  // Fallback ความปลอดภัยสูงสุดกันบอทเงียบ
  if (currentState === 'MAIN_MENU') {
    return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: mainMenuText }] });
  }
}

// ฟังก์ชันโมดูลาร์: ส่งการ์ดคำถามสุขภาพจิตพร้อมปุ่ม Quick Reply
function sendMentalQuestion(event, qId, prefixText) {
  const question = MENTAL_QUESTIONS.find(q => q.id === qId);
  return client.replyMessage({
    replyToken: event.replyToken,
    messages: [{
      type: 'text',
      text: `${prefixText}🧠 [แบบทดสอบสุขภาพจิต]\n\n${question.text}\n\nโปรดเลือกคำตอบที่ตรงความรู้สึกที่สุด:`,
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

// ฟังก์ชันช่วยย่อย: อัปเดตสถานะบอทลง Supabase
async function updateState(userId, state, context) {
  await supabase.from('user_states').upsert({ user_id: userId, state, context }, { onConflict: 'user_id' });
}

// ฟังก์ชันช่วยย่อย: พ่นข้อความเตือนเมื่อกรอกผิดเงื่อนไข
function replyErr(event, msg) {
  return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: '⚠️ ' + msg }] });
}

// ฟังก์ชันช่วยย่อย: คำนวณสรีระศาสตร์และเซฟลงฐานข้อมูลโปรไฟล์
async function saveUserProfile(userId, gender, age, chronic_disease, lifestyle, weight, height) {
  const heightMeter = height / 100;
  const bmi = parseFloat((weight / (heightMeter * heightMeter)).toFixed(1));
  
  // สูตร Mifflin-St Jeor คำนวณหาพลังงาน BMR
  let bmr = (gender === 'ชาย') ? (10 * weight + 6.25 * height - 5 * age + 5) : (10 * weight + 6.25 * height - 5 * age - 161);
  bmr = isNaN(bmr) ? 1500 : Math.round(bmr);
  
  // สมมติค่ากิจกรรมปานกลางคูณ 1.375 เพื่อหา TDEE
  const tdee = Math.round(bmr * 1.375);

  await supabase.from('user_profiles').upsert({
    user_id: userId, gender, age, chronic_disease, lifestyle, weight, height, bmi, bmr, tdee
  }, { onConflict: 'user_id' });
}

app.listen(process.env.PORT || 3000, () => {
  console.log('Server is perfectly running!');
});