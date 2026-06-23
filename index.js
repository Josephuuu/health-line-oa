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

// คลังข้อมูลเมนูอาหารละเอียด (สำหรับฟีเจอร์ที่ 4 และ 5)
const CANTEEN_DATA = {
  'เกาเหลาน้ำใส': { cals: 180, carb: 8, protein: 22, fat: 6, info: 'โซเดียมปานกลาง เลี่ยงซดน้ำซุปจะดีมาก' },
  'ต้มจืดเต้าหู้หมูสับ': { cals: 200, carb: 10, protein: 18, fat: 8, info: 'ย่อยง่าย โปรตีนดี โซเดียมน้อย' },
  'แกงส้มผักรวม': { cals: 120, carb: 15, protein: 4, fat: 0, info: 'ไม่มีน้ำมัน แต่โซเดียมค่อนข้างสูง' },
  'กะเพราอกไก่ข้าวกล้อง': { cals: 380, carb: 45, protein: 30, fat: 6, info: 'สารอาหารครบถ้วน เหมาะกับการคุมน้ำหนัก' },
  'ข้าวต้มปลา': { cals: 250, carb: 30, protein: 18, fat: 2, info: 'ไขมันต่ำมาก อิ่มสบายท้อง' },
  'ส้มตำไทยไก่ย่าง': { cals: 280, carb: 22, protein: 25, fat: 7, info: 'ระวังเรื่องความหวานและโซเดียมในน้ำส้มตำ' },
  'ข้าวมันไก่เนื้ออก': { cals: 350, carb: 40, protein: 28, fat: 8, info: 'เน้นอกไก่ไม่หนัง สั่งเปลี่ยนเป็นข้าวสวยธรรมดาจะลดแคลได้อีก' },
  'สลัดผักอกไก่': { cals: 220, carb: 12, protein: 24, fat: 5, info: 'ไฟเบอร์สูง แนะนำน้ำสลัดใสหรือใส่น้อย ๆ' }
};

const MENTAL_QUESTIONS = [
  { id: 1, text: "1. ท่านรู้สึกพึงพอใจในชีวิต" },
  { id: 2, text: "2. ท่านรู้สึกสบายใจ" },
  { id: 3, text: "3. ท่านรู้สึกสดชื่นเบิกบานใจ" },
  { id: 4, text: "4. ท่านรู้สึกชีวิตของท่านมีความสุขสงบ" },
  { id: 5, text: "5. ท่านรู้สึกเบื่อหน่ายท้อแท้กับการดำเนินชีวิตประจำวัน" }
];

app.get('/', (req, res) => res.send('Health Bot v2 is running!'));

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

  // ดึงสถานะปัจจุบันของ User
  let { data: stateData } = await supabase.from('user_states').select('state, context').eq('user_id', userId).single();
  let currentState = stateData ? stateData.state : 'MAIN_MENU';
  let currentContext = stateData && stateData.context ? stateData.context : {};

  if (!stateData) {
    await supabase.from('user_states').insert({ user_id: userId, state: 'MAIN_MENU', context: {} });
    currentState = 'MAIN_MENU';
  }

  // ดึงโปรไฟล์เพื่อเช็กว่าเคยลงทะเบียนหรือยัง
  let { data: profile } = await supabase.from('user_profiles').select('*').eq('user_id', userId).single();

  // -----------------------------------------------------------------
  // 🚨 [RULE] บังคับลงทะเบียนครั้งแรกก่อนใช้ฟีเจอร์อื่น!
  // -----------------------------------------------------------------
  if (!profile && currentState === 'MAIN_MENU' && userMessage !== '1' && !userMessage.includes('ลงทะเบียน')) {
    await updateState(userId, 'REG_GENDER', {});
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{
        type: 'text',
        text: '👋 ยินดีต้อนรับสู่ระบบดูแลสุขภาพครับ!\nเนื่องจากคุณใช้งานเป็นครั้งแรก เพื่อความปลอดภัยและคำนวณค่าพลังงานที่ถูกต้อง\n\nโปรดเริ่มต้นด้วยการกรอกประวัติก่อนนะครับ\n\n👉 โปรดเลือก เพศ ของคุณ:',
        quickReply: { items: [{ type: 'action', action: { type: 'message', label: '🙋‍♂️ ชาย', text: 'ชาย' } }, { type: 'action', action: { type: 'message', label: '🙋‍♀️ หญิง', text: 'หญิง' } }] }
      }]
    });
  }

  const mainMenuText = `🤖 เมนูหลักระบบดูแลสุขภาพและโภชนาการ:\n\n` +
                       `1️⃣ [ลงทะเบียนประวัติสุขภาพ] (แก้ไขข้อมูลเริ่มต้น)\n` +
                       `2️⃣ [อัปเดตน้ำหนัก/ส่วนสูง] (ปรับสัดส่วนปัจจุบันเพื่อคำนวณ BMI ใหม่)\n` +
                       `3️⃣ [บันทึกสุขภาพรายวัน] (เช็กอินความรู้สึกและอาการป่วยวันต่อวัน)\n` +
                       `4️⃣ [แนะนำอาหารลดน้ำหนักโรงอาหาร] (จัดเมนูตามแคลอรีเฉพาะบุคคล)\n` +
                       `5️⃣ [ค้นหาโภชนาการเมนูโรงอาหาร] (เช็กแคล/คาร์บ/โปรตีน ของแต่ละเมนู)\n` +
                       `6️⃣ [แบบทดสอบสุขภาพจิตรายเดือน] (ทำประเมินสุขภาพจิตและสภาวะอารมณ์)\n\n` +
                       `👉 พิมพ์หมายเลขเมนู หรือพิมพ์ "เมนูหลัก" เพื่อกลับหน้านี้ได้ตลอดเวลาครับ`;

  // Global Command
  if (userMessage === 'กลับหน้าหลัก' || userMessage === 'เมนูหลัก' || userMessage === 'เมนู') {
    await updateState(userId, 'MAIN_MENU', {});
    return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: mainMenuText }] });
  }

  // ==========================================
  // 📥 เมนูตัวเลือกเมื่อสแตนด์บายที่หน้า MAIN_MENU
  // ==========================================
  if (currentState === 'MAIN_MENU') {
    
    // เมนู 1: ลงทะเบียนประวัติสุขภาพ
    if (userMessage === '1' || userMessage.includes('ลงทะเบียน')) {
      await updateState(userId, 'REG_GENDER', {});
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{
          type: 'text',
          text: 'เริ่มขั้นตอนลงทะเบียนประวัติสุขภาพครับ\n\nโปรดเลือก เพศ ของคุณ:',
          quickReply: { items: [{ type: 'action', action: { type: 'message', label: '🙋‍♂️ ชาย', text: 'ชาย' } }, { type: 'action', action: { type: 'message', label: '🙋‍♀️ หญิง', text: 'หญิง' } }] }
        }]
      });
    }

    // เมนู 2: อัปเดตน้ำหนักและส่วนสูง
    if (userMessage === '2' || userMessage.includes('อัปเดตน้ำหนัก')) {
      await updateState(userId, 'UPDATE_WEIGHT', {});
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: '🔄 อัปเดตสัดส่วนร่างกายปัจจุบัน\n\nโปรดพิมพ์ น้ำหนัก ของคุณเป็นตัวเลข (กก.) เช่น 65' }] });
    }

    // เมนู 3: บันทึกประจำวัน (สั้น กระชับ จบในตัวไม่มีการลิ้งค์ไปทำแบบทดสอบต่อ)
    if (userMessage === '3' || userMessage.includes('บันทึกประจำวัน')) {
      await updateState(userId, 'DAILY_MOOD', {});
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{
          type: 'text',
          text: '🌤️ [บันทึกสุขภาพประจำวัน]\n\nวันนี้คุณรู้สึกอย่างไรบ้างครับ?',
          quickReply: {
            items: [
              { type: 'action', action: { type: 'message', label: '😊 มีความสุข/สดชื่น', text: 'มีความสุข' } },
              { type: 'action', action: { type: 'message', label: '😐 ปกติ', text: 'ปกติ' } },
              { type: 'action', action: { type: 'message', label: '😴 เหนื่อยล้า/เพลีย', text: 'เหนื่อยล้า' } },
              { type: 'action', action: { type: 'message', label: '😫 เครียด/กังวล', text: 'เครียด' } }
            ]
          }
        }]
      });
    }

    // เมนู 4: แนะนำอาหารลดน้ำหนักอิงตามสรีระ BMR/TDEE ของผู้ใช้
    if (userMessage === '4' || userMessage.includes('แนะนำอาหาร')) {
      const tdee = profile.tdee || 2000;
      const targetCal = Math.round((tdee - 500) / 3); // โควตาลดน้ำหนักต่อมื้อ

      let foodResponse = `🏪 [เมนูแนะนำเพื่อลดน้ำหนักในโรงอาหารของคุณ]\n`;
      foodResponse += `📊 เป้าหมายพลังงานมื้อนี้: ไม่ควรเกิน **${targetCal} kcal**\n`;
      foodResponse += `🩺 โรคประจำตัว: ${profile.chronic_disease} | พฤติกรรม: ${profile.lifestyle}\n`;
      foodResponse += `-------------------------------------\n\n`;
      foodResponse += `💡 เมนูโรงอาหารที่แนะนำ:\n`;
      foodResponse += `• เกาเหลาน้ำใสหมูสับ/อกไก่ (~180 kcal)\n`;
      foodResponse += `• ต้มจืดเต้าหู้หมูสับวุ้นเส้น (~200 kcal)\n`;
      foodResponse += `• แกงส้มผักรวม + ข้าวสวยข้าวกล้อง 1.5 ทัพพี (~250 kcal)\n`;
      foodResponse += `• กะเพราอกไก่ (น้ำมันน้อย) + ข้าวกล้อง (~380 kcal)\n\n`;
      
      if (profile.chronic_disease.includes('ความดัน')) {
        foodResponse += `⚠️ *คำแนะนำพิเศษ*: หลีกเลี่ยงการซดน้ำซุปก๋วยเตี๋ยวหรือแกงส้ม เพื่อควบคุมปริมาณโซเดียมไม่ให้สูงเกินไปนะครับ\n`;
      }
      foodResponse += `🏠 พิมพ์ "เมนูหลัก" เพื่อกลับไปหน้ารวมฟีเจอร์`;
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: foodResponse }] });
    }

    // เมนู 5: ฟีเจอร์แยกใหม่ - ค้นหาแคลอรี่และคาร์โบไฮเดรตในเมนูโรงอาหาร
    if (userMessage === '5' || userMessage.includes('ค้นหา')) {
      await updateState(userId, 'SEARCH_NUTRIENT', {});
      let searchIntro = `🔍 [โหมดค้นหาคุณค่าทางโภชนาการเมนูโรงอาหาร]\n\n`;
      searchIntro += `โปรดพิมพ์ชื่อเมนูที่ต้องการตรวจสอบสารอาหารมาได้เลยครับ\n`;
      searchIntro += `*(ตัวอย่างเมนูที่มีในฐานข้อมูลโรงอาหารตอนนี้: เกาเหลาน้ำใส, ต้มจืดเต้าหู้หมูสับ, แกงส้มผักรวม, กะเพราอกไก่ข้าวกล้อง, ข้าวต้มปลา, ส้มตำไทยไก่ย่าง, ข้าวมันไก่เนื้ออก, สลัดผักอกไก่)*`;
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: searchIntro }] });
    }

    // เมนู 6: ย้ายแบบทดสอบสุขภาพจิตมาเป็นโหมดรายเดือนเดี่ยว ๆ แยกเป็นสัดส่วน
    if (userMessage === '6' || userMessage.includes('สุขภาพจิต')) {
      currentContext.current_q = 1;
      currentContext.scores = {};
      await updateState(userId, 'MONTHLY_MENTAL', currentContext);
      return sendMentalQuestion(event, 1, '🧠 [แบบทดสอบสุขภาพจิตประจำเดือน]\nเพื่อประเมินระดับสภาวะอารมณ์และจิตใจของคุณในรอบเดือนนี้ มาเริ่มกันเลยครับ!\n\n');
    }
  }

  // ==========================================
  // ⚡ CONTROL STATES MACHINE (พาร์ททำงานเชิงลึกตามโหมด)
  // ==========================================
  switch (currentState) {
    
    // --- โหมดลงทะเบียนประวัติสุขภาพ ---
    case 'REG_GENDER':
      if (userMessage !== 'ชาย' && userMessage !== 'หญิง') return replyErr(event, 'โปรดเลือก "ชาย" หรือ "หญิง" จากปุ่มด้านล่างครับ');
      currentContext.gender = userMessage;
      await updateState(userId, 'REG_AGE', currentContext);
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'คุณอายุเท่าไหร่ครับ? (กรอกเป็นตัวเลข เช่น 25)' }] });

    case 'REG_AGE':
      const age = parseInt(userMessage);
      if (isNaN(age) || age <= 0 || age > 110) return replyErr(event, 'โปรดระบุอายุเป็นตัวเลขที่ถูกต้องครับ');
      currentContext.age = age;
      await updateState(userId, 'REG_DISEASE', currentContext);
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{
          type: 'text',
          text: 'คุณมีโรคประจำตัวหรือไม่ครับ? (กดเลือกจากปุ่มด่วนด้านล่างได้เลย)',
          quickReply: {
            items: [
              { type: 'action', action: { type: 'message', label: '❌ ไม่มีโรคประจำตัว', text: 'ไม่มี' } }, // เพิ่มปุ่มไม่มีตามคำสั่ง
              { type: 'action', action: { type: 'message', label: '🩺 ความดันโลหิตสูง', text: 'ความดันโลหิตสูง' } },
              { type: 'action', action: { type: 'message', label: '🩸 เบาหวาน', text: 'เบาหวาน' } },
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
          text: 'พฤติกรรมการใช้ชีวิตประจำวันของคุณเป็นอย่างไร?',
          quickReply: {
            items: [
              { type: 'action', action: { type: 'message', label: '🖥️ นั่งทำงาน/เรียน เป็นหลัก', text: 'นั่งทำงานทั่วไป' } },
              { type: 'action', action: { type: 'message', label: '🛠️ ทำงานหนัก/แบกของหนัก', text: 'ทำงานหนักใช้แรง' } },
              { type: 'action', action: { type: 'message', label: '🚬 สูบบุหรี่หรือดื่มสุรา', text: 'สูบบุหรี่หรือดื่ม' } }
            ]
          }
        }]
      });

    case 'REG_LIFESTYLE':
      currentContext.lifestyle = userMessage;
      await updateState(userId, 'REG_WEIGHT', currentContext);
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ขอน้ำหนักตัวปัจจุบันของคุณ (กิโลกรัม) ตัวเลขเท่านั้นครับ:' }] });

    case 'REG_WEIGHT':
      const w = parseFloat(userMessage);
      if (isNaN(w) || w <= 0) return replyErr(event, 'โปรดกรอกตัวเลขน้ำหนักที่ถูกต้องครับ');
      currentContext.weight = w;
      await updateState(userId, 'REG_HEIGHT', currentContext);
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'ขอส่วนสูงปัจจุบันของคุณ (เซนติเมตร) ตัวเลขเท่านั้นครับ:' }] });

    case 'REG_HEIGHT':
      const h = parseFloat(userMessage);
      if (isNaN(h) || h <= 0) return replyErr(event, 'โปรดกรอกตัวเลขส่วนสูงที่ถูกต้องครับ');
      
      await saveUserProfile(userId, currentContext.gender, currentContext.age, currentContext.chronic_disease, currentContext.lifestyle, currentContext.weight, h);
      await updateState(userId, 'MAIN_MENU', {});
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: '🎉 ลงทะเบียนประวัติสุขภาพเสร็จสมบูรณ์เรียบร้อยครับ!\n\n' + mainMenuText }] });


    // --- โหมดอัปเดตสัดส่วนสรีระ ---
    case 'UPDATE_WEIGHT':
      const uw = parseFloat(userMessage);
      if (isNaN(uw) || uw <= 0) return replyErr(event, 'โปรดระบุน้ำหนักเป็นตัวเลขครับ');
      currentContext.weight = uw;
      await updateState(userId, 'UPDATE_HEIGHT', currentContext);
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'โปรดระบุ ส่วนสูง ปัจจุบันของคุณเป็นตัวเลข (ซม.):' }] });

    case 'UPDATE_HEIGHT':
      const uh = parseFloat(userMessage);
      if (isNaN(uh) || uh <= 0) return replyErr(event, 'โปรดระบุส่วนสูงเป็นตัวเลขครับ');
      
      if (profile) {
        await saveUserProfile(userId, profile.gender, profile.age, profile.chronic_disease, profile.lifestyle, currentContext.weight, uh);
      } else {
        await saveUserProfile(userId, 'ไม่ระบุ', 0, 'ไม่มี', 'ทั่วไป', currentContext.weight, uh);
      }
      await updateState(userId, 'MAIN_MENU', {});
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: '💪 อัปเดตสัดส่วนสรีระร่างกายและดัชนีพลังงานใหม่เรียบร้อยครับ!\n\n' + mainMenuText }] });


    // --- โหมดบันทึกรายวัน (ความรู้สึก + อาการป่วย) ---
    case 'DAILY_MOOD':
      currentContext.mood = userMessage;
      await updateState(userId, 'DAILY_SYMPTOM', currentContext);
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: '🩺 วันนี้คุณมีอาการผิดปกติทางร่างกายตรงไหนไหมครับ? (เช่น ปวดหัว, ไอ, เจ็บคอ หรือถ้าสบายดีพิมพ์ว่า "ไม่มี")' }] });

    case 'DAILY_SYMPTOM':
      const todayStr = new Date().toISOString().split('T')[0];
      await supabase.from('daily_progress').upsert({
        user_id: userId, log_date: todayStr, mood_today: currentContext.mood, symptoms_today: userMessage
      }, { onConflict: 'user_id,log_date' });

      await updateState(userId, 'MAIN_MENU', {});
      let dailySummary = `📝 [บันทึกข้อมูลรายวันสำเร็จ]\n\n`;
      dailySummary += `• ความรู้สึกวันนี้: ${currentContext.mood}\n`;
      dailySummary += `• อาการป่วยทางกาย: ${userMessage}\n\n`;
      dailySummary += `ระบบบันทึกความเปลี่ยนแปลงสุขภาพของคุณไว้ในฐานข้อมูลเรียบร้อยครับ พรุ่งนี้มาเช็กอินใหม่นะ!\n\n` + mainMenuText;
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: dailySummary }] });


    // --- โหมดค้นหาโภชนาการอาหารโรงอาหาร (ฟีเจอร์ที่ 5) ---
    case 'SEARCH_NUTRIENT':
      let matchedKey = Object.keys(CANTEEN_DATA).find(k => userMessage.includes(k) || k.includes(userMessage));
      
      if (matchedKey) {
        const meal = CANTEEN_DATA[matchedKey];
        let resultText = `🥗 [ข้อมูลโภชนาการ: เมนู${matchedKey}]\n`;
        resultText += `-------------------------------------\n`;
        resultText += `🔥 พลังงานทั้งหมด: **${meal.cals} kcal**\n`;
        resultText += `🍞 คาร์โบไฮเดรต: **${meal.carb} กรัม**\n`;
        resultText += `🥩 โปรตีน: **${meal.protein} กรัม**\n`;
        resultText += `🥑 ไขมัน: **${meal.fat} กรัม**\n`;
        resultText += `ℹ️ ข้อแนะนำ: ${meal.info}\n`;
        resultText += `-------------------------------------\n\n`;
        resultText += `🔍 สามารถพิมพ์ค้นหาเมนูอื่นต่อไปได้เลย หรือพิมพ์ "เมนูหลัก" เพื่อเลิกค้นหาครับ`;
        return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: resultText }] });
      } else {
        return client.replyMessage({ 
          replyToken: event.replyToken, 
          messages: [{ type: 'text', text: `❌ ไม่พบข้อมูลเมนู "${userMessage}" ในฐานข้อมูลโรงอาหารตอนนี้\n\nทดลองพิมพ์คำสำคัญสั้น ๆ เช่น ข้าวมันไก่, กะเพรา, แกงส้ม หรือพิมพ์ "เมนูหลัก" เพื่อออกจากการค้นหาครับ` }] 
        });
      }


    // --- โหมดประเมินสุขภาพจิตรายเดือน ---
    case 'MONTHLY_MENTAL':
      const validScores = ['0', '1', '2', '3'];
      if (!validScores.includes(userMessage)) {
        return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: '⚠️ โปรดกดเลือกปุ่มคะแนนด้านล่างเท่านั้นเพื่อป้องกันระบบรวนครับ' }] });
      }

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

        let mentalResult = totalScore <= 5 ? "🚨 อยู่ในสภาวะมีความเสี่ยงตึงเครียดสะสม" : "🟢 ระดับสุขภาพใจปกติ มีความสมดุลดี";
        
        await supabase.from('mental_health_scores').insert({ user_id: userId, total_score: totalScore, result_text: mentalResult });
        await updateState(userId, 'MAIN_MENU', {});

        let mentalSummary = `🧠 [สรุปผลการประเมินสุขภาพจิตประจำเดือน]\n`;
        mentalSummary += `-------------------------------------\n`;
        mentalSummary += `📊 คะแนนที่ได้: **${totalScore} / 15 คะแนน**\n`;
        mentalSummary += `🔍 ผลวิเคราะห์: **${mentalResult}**\n\n`;
        mentalSummary += `ขอบคุณที่ร่วมประเมินสภาวะใจอย่างสม่ำเสมอครับ ยินดีต้อนรับกลับเข้าสู่หน้าหลัก\n\n` + mainMenuText;
        return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: mentalSummary }] });
      }
  }

  if (currentState === 'MAIN_MENU') {
    return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: mainMenuText }] });
  }
}

// ฟังก์ชันช่วยยิงการ์ดคำถามสุขภาพจิตพร้อมตัวเลือกด่วน
function sendMentalQuestion(event, qId, prefix) {
  const question = MENTAL_QUESTIONS.find(q => q.id === qId);
  return client.replyMessage({
    replyToken: event.replyToken,
    messages: [{
      type: 'text',
      text: `${prefix}📋 ${question.text}\n\nคำตอบที่ตรงกับตัวคุณในช่วงนี้มากที่สุด:`,
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

async function saveUserProfile(userId, gender, age, chronic_disease, lifestyle, weight, height) {
  const heightMeter = height / 100;
  const bmi = parseFloat((weight / (heightMeter * heightMeter)).toFixed(1));
  let bmr = (gender === 'ชาย') ? (10 * weight + 6.25 * height - 5 * age + 5) : (10 * weight + 6.25 * height - 5 * age - 161);
  bmr = isNaN(bmr) ? 1500 : Math.round(bmr);
  const tdee = Math.round(bmr * 1.375);

  await supabase.from('user_profiles').upsert({
    user_id: userId, gender, age, chronic_disease, lifestyle, weight, height, bmi, bmr, tdee
  }, { onConflict: 'user_id' });
}

app.listen(process.env.PORT || 3000, () => {
  console.log('Server runs perfectly with 5 Features!');
});