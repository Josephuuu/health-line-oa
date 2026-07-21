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
                       `4️⃣ [แนะนำอาหารลดน้ำหนักโรงอาหาร] (สุ่มคัดสรรเมนูตามแคลอรีเฉพาะบุคคล)\n` +
                       `5️⃣ [ค้นหาโภชนาการเมนูโรงอาหาร] (ค้นหาแคล/คาร์บ/โปรตีน จากคลัง 158+ เมนู)\n` +
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

    // เมนู 3: บันทึกประจำวัน
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

    // เมนู 4: แนะนำอาหารลดน้ำหนัก (ดึงตรงจาก Supabase คลัง 158+ เมนู)
    if (userMessage === '4' || userMessage.includes('แนะนำอาหาร')) {
      const tdee = profile.tdee || 2000;
      const targetCal = Math.round((tdee - 500) / 3); // โควตาลดน้ำหนักต่อมื้อ

      // ดึงเมนูในคลัง Supabase ที่มีแคลอรีไม่เกิน targetCal
      let { data: fitMenus } = await supabase
        .from('canteen_menus')
        .select('*')
        .lte('calories', targetCal)
        .limit(30);

      // ถ้าค้นหาแล้วไม่เจอ ให้ดึงเมนูทั่วไปสุ่มมา
      if (!fitMenus || fitMenus.length === 0) {
        let { data: fallback } = await supabase.from('canteen_menus').select('*').limit(10);
        fitMenus = fallback || [];
      }

      // สุ่มคัดมา 3 เมนูเพื่อความหลากหลาย
      const randomSelected = fitMenus.sort(() => 0.5 - Math.random()).slice(0, 3);

      let foodResponse = `🏪 [เมนูแนะนำเพื่อลดน้ำหนักในโรงอาหารของคุณ]\n`;
      foodResponse += `📊 เป้าหมายพลังงานมื้อนี้: ไม่ควรเกิน **${targetCal} kcal**\n`;
      foodResponse += `🩺 โรคประจำตัว: ${profile.chronic_disease} | พฤติกรรม: ${profile.lifestyle}\n`;
      foodResponse += `-------------------------------------\n\n`;
      foodResponse += `💡 เมนูคัดสรรแนะนำประจำมื้อนี้:\n`;

      if (randomSelected.length > 0) {
        randomSelected.forEach((item, idx) => {
          foodResponse += `${idx + 1}. **${item.menu_name}** (~${item.calories} kcal)\n`;
        });
      } else {
        foodResponse += `• เกาเหลาน้ำใส (~180 kcal)\n• ต้มจืดเต้าหู้หมูสับ (~200 kcal)\n`;
      }

      foodResponse += `\n`;
      if (profile.chronic_disease && profile.chronic_disease.includes('ความดัน')) {
        foodResponse += `⚠️ *คำแนะนำพิเศษ*: หลีกเลี่ยงการซดน้ำซุปหรือเมนูรสจัด เพื่อควบคุมปริมาณโซเดียมนะครับ\n\n`;
      }
      foodResponse += `🏠 พิมพ์ "เมนูหลัก" เพื่อกลับไปหน้ารวมฟีเจอร์`;
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: foodResponse }] });
    }

    // เมนู 5: ค้นหาคุณค่าทางโภชนาการ (ดึงจาก Supabase สดๆ)
    if (userMessage === '5' || userMessage.includes('ค้นหา')) {
      await updateState(userId, 'SEARCH_NUTRIENT', {});
      let searchIntro = `🔍 [โหมดค้นหาคุณค่าทางโภชนาการเมนูโรงอาหาร]\n\n`;
      searchIntro += `โปรดพิมพ์ชื่อเมนูหรือคำสำคัญที่ต้องการค้นหามาได้เลยครับ (ระบบจะค้นจากคลัง 158+ เมนู)\n\n`;
      searchIntro += `*(ตัวอย่าง: พิมพ์คำว่า "กะเพรา", "แกง", "ไก่", "หมู" หรือชื่อเมนูเต็มได้เลยครับ)*`;
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: searchIntro }] });
    }

    // เมนู 6: ประเมินสุขภาพจิตรายเดือน
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
              { type: 'action', action: { type: 'message', label: '❌ ไม่มีโรคประจำตัว', text: 'ไม่มี' } },
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


    // --- โหมดบันทึกรายวัน ---
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


    // --- โหมดค้นหาโภชนาการอาหารโรงอาหาร (ยิงตรง Supabase) ---
    case 'SEARCH_NUTRIENT':
      let { data: matchedMenus } = await supabase
        .from('canteen_menus')
        .select('*')
        .ilike('menu_name', `%${userMessage}%`)
        .limit(3);

      if (matchedMenus && matchedMenus.length > 0) {
        let resultText = `🥗 [ผลการค้นหาเมนูโรงอาหารจากฐานข้อมูล]\n`;
        resultText += `-------------------------------------\n`;
        
        matchedMenus.forEach((meal) => {
          resultText += `📌 **${meal.menu_name}**\n`;
          resultText += `🔥 พลังงาน: **${meal.calories || '-'} kcal**\n`;
          resultText += `🍞 คาร์บ: ${meal.carbs || '-'}g | 🥩 โปรตีน: ${meal.protein || '-'}g | 🥑 ไขมัน: ${meal.fat || '-'}g\n`;
          if (meal.note) resultText += `ℹ️ คำแนะนำ: ${meal.note}\n`;
          resultText += `-------------------------------------\n`;
        });
        
        resultText += `\n🔍 พิมพ์ค้นหาเมนูอื่นต่อได้เลย หรือพิมพ์ "เมนูหลัก" เพื่อเลิกค้นหาครับ`;
        return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: resultText }] });
      } else {
        return client.replyMessage({ 
          replyToken: event.replyToken, 
          messages: [{ type: 'text', text: `❌ ไม่พบเมนู "${userMessage}" ในฐานข้อมูล 158 รายการ\n\nลองพิมพ์คำสั้นๆ เช่น "ไก่", "หมู", "แกง" หรือพิมพ์ "เมนูหลัก" เพื่อออกจากการค้นหาครับ` }] 
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
  console.log('Server runs perfectly connected to Supabase Canteen Database!');
});