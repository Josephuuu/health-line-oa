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
  { id: 1, text: "1. ท่านรู้สึกพึงพอใจในชีวิต" },
  { id: 2, text: "2. ท่านรู้สึกสบายใจ" },
  { id: 3, text: "3. ท่านรู้สึกสดชื่นเบิกบานใจ" },
  { id: 4, text: "4. ท่านรู้สึกชีวิตของท่านมีความสุขสงบ" },
  { id: 5, text: "5. ท่านรู้สึกเบื่อหน่ายท้อแท้กับการดำเนินชีวิตประจำวัน" }
];

app.get('/', (req, res) => res.send('Health Bot v8 with Daily Health Missions is running!'));

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

  // 🚨 บังคับลงทะเบียนครั้งแรก
  if (!profile && currentState === 'MAIN_MENU' && userMessage !== '1' && !userMessage.includes('ลงทะเบียน')) {
    await updateState(userId, 'REG_GENDER', {});
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [getGenderFlexCard('👋 ยินดีต้อนรับสู่ระบบดูแลสุขภาพ!\nโปรดลงทะเบียนประวัติเพื่อเริ่มต้นใช้งานครับ')]
    });
  }

  const mainMenuText = `🤖 เมนูหลักระบบดูแลสุขภาพและโภชนาการ:\n\n` +
                       `1️⃣ [ลงทะเบียนประวัติสุขภาพ] (แก้ไขข้อมูล/ระดับชั้น)\n` +
                       `2️⃣ [อัปเดตน้ำหนัก/ส่วนสูง] (ปรับสัดส่วนเพื่อคำนวณเป้าหมายใหม่)\n` +
                       `3️⃣ [ภารกิจสุขภาพ & บันทึกรายวัน] (เช็กอินน้ำดื่ม ก้าวเดิน ยืดตัว และสภาวะจิตใจ)\n` +
                       `4️⃣ [แนะนำอาหารลดน้ำหนักโรงอาหาร] (สุ่มคัดสรรเมนูตามแคลอรีเฉพาะบุคคล)\n` +
                       `5️⃣ [ค้นหาโภชนาการเมนูโรงอาหาร] (ค้นหาแคล/คาร์บ/โปรตีน จากคลัง 158+ เมนู)\n` +
                       `6️⃣ [แบบทดสอบสุขภาพจิตรายเดือน] (ทำประเมินสุขภาพจิตและสภาวะอารมณ์)\n\n` +
                       `👉 พิมพ์หมายเลขเมนู เลือกปุ่มริชเมนู หรือพิมพ์ "เมนูหลัก" ได้ตลอดเวลาครับ`;

  if (userMessage === 'กลับหน้าหลัก' || userMessage === 'เมนูหลัก' || userMessage === 'เมนู') {
    await updateState(userId, 'MAIN_MENU', {});
    return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: mainMenuText }] });
  }

  // Interceptor
  const isMenuTrigger = ['1', '2', '3', '4', '5', '6'].includes(userMessage) ||
                        userMessage.includes('ลงทะเบียน') ||
                        userMessage.includes('อัปเดตน้ำหนัก') ||
                        userMessage.includes('ภารกิจ') ||
                        userMessage.includes('แนะนำอาหาร') ||
                        userMessage.includes('ค้นหา') ||
                        userMessage.includes('สุขภาพจิต');

  const isAnsweringMentalTest = (currentState === 'MONTHLY_MENTAL') && ['0', '1', '2', '3'].includes(userMessage);

  if (isMenuTrigger && !isAnsweringMentalTest && currentState !== 'MAIN_MENU') {
    currentState = 'MAIN_MENU';
    currentContext = {};
  }

  // ==========================================
  // 📥 MAIN MENU & FEATURE ROUTING
  // ==========================================
  if (currentState === 'MAIN_MENU') {
    
    // เมนู 1: ลงทะเบียน
    if (userMessage === '1' || userMessage.includes('ลงทะเบียน')) {
      await updateState(userId, 'REG_GENDER', {});
      return client.replyMessage({ replyToken: event.replyToken, messages: [getGenderFlexCard('เริ่มต้นขั้นตอนลงทะเบียนประวัติสุขภาพครับ')] });
    }

    // เมนู 2: อัปเดตสัดส่วน
    if (userMessage === '2' || userMessage.includes('อัปเดตน้ำหนัก')) {
      await updateState(userId, 'UPDATE_WEIGHT', {});
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: '🔄 อัปเดตสัดส่วนร่างกายปัจจุบัน\n\nโปรดพิมพ์ น้ำหนัก ของคุณเป็นตัวเลข (กก.) เช่น 65' }] });
    }

    // เมนู 3: ภารกิจสุขภาพ & บันทึกประจำวัน (การ์ด Dashboard บันทึกภารกิจ)
    if (userMessage === '3' || userMessage.includes('ภารกิจ')) {
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
      const totalPct = Math.round((waterPct + stepPct + Math.min(100, (missionLog.stretch_count / 3) * 100)) / 3);

      const missionCard = {
        type: "flex",
        altText: "🎯 ภารกิจสุขภาพประจำวันของคุณ",
        contents: {
          type: "bubble",
          header: {
            type: "box", layout: "vertical", backgroundColor: COLORS.PRIMARY,
            contents: [
              { type: "text", text: "🎯 ภารกิจสุขภาพประจำวัน", color: COLORS.WHITE, weight: "bold", size: "md" },
              { type: "text", text: `ระดับผู้ใช้: ${profile?.user_type || 'บุคคลทั่วไป'} | BMI: ${profile?.bmi || '-'}`, color: "#CCFBF1", size: "xs", margin: "xs" }
            ]
          },
          body: {
            type: "box", layout: "vertical",
            contents: [
              { type: "text", text: `📊 ความสำเร็จรวมวันนี้: ${totalPct}% (Streak: ${missionLog.streak_count || 1} วัน 🔥)`, weight: "bold", size: "sm", color: COLORS.NEUTRAL_DARK },
              { type: "separator", margin: "md" },
              
              // 💧 ดื่มน้ำ
              { type: "text", text: `💧 ปริมาณน้ำดื่ม: ${missionLog.water_accum_ml} / ${targetWater} ml (${waterPct}%)`, size: "xs", color: COLORS.ACCENT, margin: "md", weight: "bold" },
              {
                type: "box", layout: "horizontal", margin: "sm",
                contents: [
                  { type: "button", style: "secondary", height: "sm", action: { type: "message", label: "+250ml", text: "บันทึกน้ำ 250" } },
                  { type: "button", style: "secondary", height: "sm", margin: "xs", action: { type: "message", label: "+500ml", text: "บันทึกน้ำ 500" } },
                  { type: "button", style: "secondary", height: "sm", margin: "xs", action: { type: "message", label: "+600ml", text: "บันทึกน้ำ 600" } }
                ]
              },

              // 🧘‍♂️ ยืดเส้นยืดสาย
              { type: "text", text: `🧘‍♂️ ยืดเส้นยืดสาย: ${missionLog.stretch_count} / 3-5 ครั้ง`, size: "xs", color: COLORS.SECONDARY, margin: "md", weight: "bold" },
              { type: "button", style: "primary", color: COLORS.SECONDARY, height: "sm", margin: "xs", action: { type: "message", label: "✅ กดบันทึก ยืดเส้นยืดสายแล้ว (+1)", text: "บันทึกยืดตัว" } },

              // 🚶‍♂️ เดินสะสม
              { type: "text", text: `🚶‍♂️ เดินสะสม: ${missionLog.step_count} / ${targetSteps} ก้าว (${stepPct}%)`, size: "xs", color: COLORS.WARNING, margin: "md", weight: "bold" },
              { type: "button", style: "primary", color: COLORS.WARNING, height: "sm", margin: "xs", action: { type: "message", label: "👟 ระบุจำนวนก้าวเดินวันนี้", text: "บันทึกก้าวเดิน" } },

              { type: "separator", margin: "md" },
              { type: "button", style: "link", height: "sm", action: { type: "message", label: "🌤️ บันทึกอารมณ์ & อาการประจำวัน", text: "เช็กอินอารมณ์" } }
            ]
          }
        }
      };

      await updateState(userId, 'MISSION_ACTION', {});
      return client.replyMessage({ replyToken: event.replyToken, messages: [missionCard] });
    }

    // เมนู 4: แนะนำอาหาร
    if (userMessage === '4' || userMessage.includes('แนะนำอาหาร')) {
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
        if (dietary.includes('มังสวิรัติ') || dietary.includes('วีแกน') || dietary.includes('เจ')) {
          if (['หมู', 'ไก่', 'เนื้อ', 'กุ้ง', 'หมึก', 'ปลา', 'ปู', 'หอย', 'เป็ด', 'ไข่', 'ตับ'].some(kw => name.includes(kw))) return false;
        }
        if (dietary.includes('ทะเล')) {
          if (['กุ้ง', 'หมึก', 'ปลา', 'ปู', 'หอย', 'ทะเล'].some(kw => name.includes(kw))) return false;
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
        type: "flex", altText: "🍱 เมนูอาหารคัดสรรแนะนำประจำมื้อนี้",
        contents: {
          type: "bubble",
          header: {
            type: "box", layout: "vertical", backgroundColor: COLORS.PRIMARY,
            contents: [
              { type: "text", text: "🍱 เมนูแนะนำเพื่อสุขภาพ", weight: "bold", size: "lg", color: COLORS.WHITE },
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
              { type: "button", style: "primary", color: COLORS.SECONDARY, action: { type: "message", label: "🎲 สุ่มเมนูใหม่อีกครั้ง", text: "4" } }
            ]
          }
        }
      };
      return client.replyMessage({ replyToken: event.replyToken, messages: [flexMenuCard] });
    }

    // เมนู 5: ค้นหาโภชนาการ
    if (userMessage === '5' || userMessage.includes('ค้นหา')) {
      await updateState(userId, 'SEARCH_NUTRIENT', {});
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: '🔍 [โหมดค้นหาคุณค่าทางโภชนาการ]\nโปรดพิมพ์ชื่อเมนูหรือคำสำคัญ (เช่น กะเพรา, ไก่, แกง) ได้เลยครับ' }] });
    }

    // เมนู 6: ประเมินสุขภาพจิต
    if (userMessage === '6' || userMessage.includes('สุขภาพจิต')) {
      currentContext = { current_q: 1, scores: {} };
      await updateState(userId, 'MONTHLY_MENTAL', currentContext);
      return sendMentalQuestion(event, 1, '🧠 [แบบทดสอบสุขภาพจิตประจำเดือน]\nมาเริ่มประเมินสภาวะอารมณ์กันเลยครับ!\n\n');
    }
  }

  // ==========================================
  // ⚡ CONTROL STATES MACHINE (ขั้นตอนย่อย)
  // ==========================================
  switch (currentState) {
    
    // Actions บันทึกภารกิจสุขภาพ
    case 'MISSION_ACTION':
      const todayStr = new Date().toISOString().split('T')[0];
      
      // บันทึกน้ำ
      if (userMessage.startsWith('บันทึกน้ำ')) {
        const addedWater = parseInt(userMessage.replace('บันทึกน้ำ', '').trim()) || 250;
        let { data: mLog } = await supabase.from('daily_missions').select('water_accum_ml').eq('user_id', userId).eq('log_date', todayStr).single();
        const newWater = (mLog?.water_accum_ml || 0) + addedWater;
        
        await supabase.from('daily_missions').upsert({ user_id: userId, log_date: todayStr, water_accum_ml: newWater }, { onConflict: 'user_id,log_date' });
        await updateState(userId, 'MAIN_MENU', {});
        return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: `💧 บันทึกการดื่มน้ำ +${addedWater} ml เรียบร้อยครับ! (สะสมรวมวันนี้: ${newWater} ml)\n\nกดพิมพ์ 3 เพื่อดูการ์ดภารกิจสุขภาพได้ตลอดเวลานะครับ` }] });
      }

      // บันทึกยืดตัว
      if (userMessage === 'บันทึกยืดตัว') {
        let { data: mLog } = await supabase.from('daily_missions').select('stretch_count').eq('user_id', userId).eq('log_date', todayStr).single();
        const newStretch = (mLog?.stretch_count || 0) + 1;

        await supabase.from('daily_missions').upsert({ user_id: userId, log_date: todayStr, stretch_count: newStretch }, { onConflict: 'user_id,log_date' });
        await updateState(userId, 'MAIN_MENU', {});
        return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: `🧘‍♂️ บันทึกการยืดเส้นยืดสายเรียบร้อยครับ (+1 ครั้ง)! (สะสมรวมวันนี้: ${newStretch} ครั้ง)\n\nช่วยลดความเมื่อยล้าได้ดีมากเลยครับ!` }] });
      }

      // บันทึกก้าวเดิน
      if (userMessage === 'บันทึกก้าวเดิน') {
        await updateState(userId, 'INPUT_STEPS', {});
        return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: '👟 โปรดพิมพ์จำนวนก้าวเดินของคุณในวันนี้เข้ามาเป็นตัวเลขครับ (เช่น 8500)' }] });
      }

      // เช็กอินอารมณ์
      if (userMessage === 'เช็กอินอารมณ์') {
        await updateState(userId, 'DAILY_MOOD', {});
        return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: '🌤️ วันนี้คุณรู้สึกอย่างไรบ้างครับ? (พิมพ์อารมณ์ เช่น สดชื่น, เหนื่อยล้า, เครียด)' }] });
      }
      break;

    case 'INPUT_STEPS':
      const steps = parseInt(userMessage);
      if (isNaN(steps) || steps < 0) return replyErr(event, 'โปรดระบุจำนวนก้าวเป็นตัวเลขที่ถูกต้องครับ');
      
      const tStr = new Date().toISOString().split('T')[0];
      await supabase.from('daily_missions').upsert({ user_id: userId, log_date: tStr, step_count: steps }, { onConflict: 'user_id,log_date' });
      await updateState(userId, 'MAIN_MENU', {});
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: `👟 บันทึกจำนวนก้าวเดินวันนี้: ${steps} ก้าว เรียบร้อยครับ! เก่งมากเลยครับ!` }] });

    // ขั้นตอนลงทะเบียนประวัติ
    case 'REG_GENDER':
      if (userMessage !== 'ชาย' && userMessage !== 'หญิง') return replyErr(event, 'โปรดกดเลือก "ชาย" หรือ "หญิง" ครับ');
      currentContext.gender = userMessage;
      await updateState(userId, 'REG_AGE', currentContext);
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'คุณอายุเท่าไหร่ครับ? (กรอกเป็นตัวเลข เช่น 15)' }] });

    case 'REG_AGE':
      const age = parseInt(userMessage);
      if (isNaN(age) || age <= 0 || age > 110) return replyErr(event, 'โปรดระบุอายุเป็นตัวเลขที่ถูกต้องครับ');
      currentContext.age = age;

      // 💡 เช็กช่วงอายุนักเรียนมัธยม (12 - 18 ปี)
      if (age >= 12 && age <= 18) {
        await updateState(userId, 'REG_STUDENT_LEVEL', currentContext);
        const levelCard = {
          type: "flex", altText: "โปรดเลือกระดับชั้นเรียน",
          contents: {
            type: "bubble",
            header: {
              type: "box", layout: "vertical", backgroundColor: COLORS.PRIMARY,
              contents: [
                { type: "text", text: "🎓 ระดับการศึกษา (2/7)", color: "#CCFBF1", weight: "bold", size: "xs" },
                { type: "text", text: "คุณกำลังศึกษาอยู่ในระดับใดครับ?", color: COLORS.WHITE, weight: "bold", size: "sm", margin: "xs" }
              ]
            },
            body: {
              type: "box", layout: "vertical",
              contents: [
                { type: "button", style: "primary", color: COLORS.SECONDARY, margin: "xs", action: { type: "message", label: "🏫 มัธยมศึกษาตอนต้น (ม.ต้น)", text: "ม.ต้น" } },
                { type: "button", style: "primary", color: "#0284C7", margin: "sm", action: { type: "message", label: "🎓 มัธยมศึกษาตอนปลาย (ม.ปลาย)", text: "ม.ปลาย" } }
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
      if (userMessage !== 'ม.ต้น' && userMessage !== 'ม.ปลาย') return replyErr(event, 'โปรดเลือก "ม.ต้น" หรือ "ม.ปลาย" ครับ');
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
              { type: "text", text: "🥗 ข้อจำกัดทางอาหาร", color: "#CCFBF1", weight: "bold", size: "xs" },
              { type: "text", text: "คุณมีข้อจำกัดหรือแพ้อาหารไหมครับ?", color: COLORS.WHITE, weight: "bold", size: "sm", margin: "xs" }
            ]
          },
          body: {
            type: "box", layout: "vertical",
            contents: [
              { type: "button", style: "primary", color: COLORS.SECONDARY, margin: "xs", action: { type: "message", label: "❌ ไม่มี (ทานได้หมด)", text: "ไม่มี" } },
              { type: "button", style: "primary", color: "#0284C7", margin: "sm", action: { type: "message", label: "🌙 อิสลาม / ฮาลาล", text: "อิสลาม/ฮาลาล" } },
              { type: "button", style: "primary", color: "#10B981", margin: "sm", action: { type: "message", label: "🌱 มังสวิรัติ / วีแกน", text: "มังสวิรัติ/วีแกน" } },
              { type: "button", style: "primary", color: "#D97706", margin: "sm", action: { type: "message", label: "🦐 แพ้อาหารทะเล", text: "แพ้อาหารทะเล" } }
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
              { type: "text", text: "🏃‍♂️ พฤติกรรมประจำวัน", color: "#CCFBF1", weight: "bold", size: "xs" },
              { type: "text", text: "พฤติกรรมการใช้ชีวิตของคุณเป็นอย่างไร?", color: COLORS.WHITE, weight: "bold", size: "sm", margin: "xs" }
            ]
          },
          body: {
            type: "box", layout: "vertical",
            contents: [
              { type: "button", style: "primary", color: "#0284C7", margin: "xs", action: { type: "message", label: "🖥️ นั่งเรียน / นั่งทำงานทั่วไป", text: "นั่งทำงานทั่วไป" } },
              { type: "button", style: "primary", color: "#0284C7", margin: "sm", action: { type: "message", label: "🛠️ ทำงานหนัก / เล่นกีฬาเยอะ", text: "ทำงานหนักใช้แรง" } }
            ]
          }
        }
      };
      return client.replyMessage({ replyToken: event.replyToken, messages: [lifestyleCard] });

    case 'REG_LIFESTYLE':
      currentContext.lifestyle = userMessage;
      await updateState(userId, 'REG_WEIGHT', currentContext);
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'โปรดพิมพ์ น้ำหนัก ของคุณเป็นตัวเลข (กก.) เช่น 55' }] });

    case 'REG_WEIGHT':
      const w = parseFloat(userMessage);
      if (isNaN(w) || w <= 0) return replyErr(event, 'โปรดกรอกตัวเลขน้ำหนักที่ถูกต้องครับ');
      currentContext.weight = w;
      await updateState(userId, 'REG_HEIGHT', currentContext);
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'โปรดพิมพ์ ส่วนสูง ของคุณเป็นตัวเลข (ซม.) เช่น 165' }] });

    case 'REG_HEIGHT':
      const h = parseFloat(userMessage);
      if (isNaN(h) || h <= 0) return replyErr(event, 'โปรดกรอกตัวเลขส่วนสูงที่ถูกต้องครับ');
      
      await saveUserProfile(
        userId, currentContext.gender, currentContext.age, currentContext.user_type || 'บุคคลทั่วไป',
        currentContext.chronic_disease, currentContext.dietary_restriction || 'ไม่มี',
        currentContext.lifestyle, currentContext.weight, h
      );
      await updateState(userId, 'MAIN_MENU', {});
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: '🎉 ลงทะเบียนและคำนวณเป้าหมายสุขภาพเฉพาะบุคคลเสร็จสมบูรณ์เรียบร้อยครับ!\n\n' + mainMenuText }] });

    case 'UPDATE_WEIGHT':
      const uw = parseFloat(userMessage);
      if (isNaN(uw) || uw <= 0) return replyErr(event, 'โปรดระบุน้ำหนักเป็นตัวเลขครับ');
      currentContext.weight = uw;
      await updateState(userId, 'UPDATE_HEIGHT', currentContext);
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'โปรดพิมพ์ ส่วนสูง ของคุณเป็นตัวเลข (ซม.) เช่น 165' }] });

    case 'UPDATE_HEIGHT':
      const uh = parseFloat(userMessage);
      if (isNaN(uh) || uh <= 0) return replyErr(event, 'โปรดระบุส่วนสูงเป็นตัวเลขครับ');
      
      if (profile) {
        await saveUserProfile(userId, profile.gender, profile.age, profile.user_type, profile.chronic_disease, profile.dietary_restriction || 'ไม่มี', profile.lifestyle, currentContext.weight, uh);
      }
      await updateState(userId, 'MAIN_MENU', {});
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: '💪 อัปเดตสัดส่วนสรีระและเป้าหมายสุขภาพใหม่เรียบร้อยครับ!\n\n' + mainMenuText }] });

    case 'DAILY_MOOD':
      currentContext.mood = userMessage;
      await updateState(userId, 'DAILY_SYMPTOM', currentContext);
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: '🩺 วันนี้คุณมีอาการผิดปกติทางร่างกายตรงไหนไหมครับ? (ถ้าปกติพิมพ์ว่า "ไม่มี")' }] });

    case 'DAILY_SYMPTOM':
      const todayDate = new Date().toISOString().split('T')[0];
      await supabase.from('daily_progress').upsert({
        user_id: userId, log_date: todayDate, mood_today: currentContext.mood, symptoms_today: userMessage
      }, { onConflict: 'user_id,log_date' });

      await updateState(userId, 'MAIN_MENU', {});
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: `📝 บันทึกความรู้สึก (${currentContext.mood}) และอาการป่วย (${userMessage}) ประจำวันที่ ${todayDate} เรียบร้อยครับ!\n\n` + mainMenuText }] });

    case 'SEARCH_NUTRIENT':
      const keyword = userMessage.trim();
      let { data: matchedMenus } = await supabase.from('canteen_menus').select('*').ilike('menu_name', `%${keyword}%`).limit(3);

      if (matchedMenus && matchedMenus.length > 0) {
        const bubbles = matchedMenus.map((meal) => ({
          type: "bubble",
          header: {
            type: "box", layout: "vertical", backgroundColor: COLORS.PRIMARY,
            contents: [
              { type: "text", text: meal.menu_name, weight: "bold", size: "md", color: COLORS.WHITE, wrap: true },
              { type: "text", text: `🔥 พลังงาน: ${meal.calories || '-'} kcal`, size: "xs", color: "#CCFBF1", margin: "xs" }
            ]
          },
          body: {
            type: "box", layout: "vertical",
            contents: [
              { type: "text", text: `🍞 คาร์โบไฮเดรต: ${meal.carbs || '-'} g`, size: "xs", color: "#4B5563" },
              { type: "text", text: `🥩 โปรตีน: ${meal.protein || '-'} g`, size: "xs", color: "#4B5563", margin: "xs" },
              { type: "text", text: `🥑 ไขมัน: ${meal.fat || '-'} g`, size: "xs", color: "#4B5563", margin: "xs" }
            ]
          }
        }));
        return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: "flex", altText: "ผลการค้นหา", contents: { type: "carousel", contents: bubbles } }] });
      } else {
        return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: `❌ ไม่พบเมนู "${userMessage}" ลองค้นด้วยคำสั้นๆ เช่น ไก่, หมู, แกง` }] });
      }

    case 'MONTHLY_MENTAL':
      const validScores = ['0', '1', '2', '3'];
      if (!validScores.includes(userMessage)) return replyErr(event, 'โปรดเลือกคะแนนจากปุ่มครับ');

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
        let mentalResult = totalScore <= 5 ? "🚨 มีความเสี่ยงตึงเครียดสะสม" : "🟢 สุขภาพใจปกติ สมดุลดี";
        
        await supabase.from('mental_health_scores').insert({ user_id: userId, total_score: totalScore, result_text: mentalResult });
        await updateState(userId, 'MAIN_MENU', {});
        return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: `🧠 ผลประเมินสุขภาพจิต: ${totalScore}/15 คะแนน\nวิเคราะห์: ${mentalResult}\n\n` + mainMenuText }] });
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
          { type: "text", text: "🩺 ประวัติสุขภาพ", color: "#CCFBF1", weight: "bold", size: "xs" },
          { type: "text", text: "คุณมีโรคประจำตัวหรือไม่ครับ?", color: COLORS.WHITE, weight: "bold", size: "md", margin: "xs" }
        ]
      },
      body: {
        type: "box", layout: "vertical",
        contents: [
          { type: "button", style: "primary", color: COLORS.SECONDARY, margin: "xs", action: { type: "message", label: "❌ ไม่มีโรคประจำตัว", text: "ไม่มี" } },
          { type: "button", style: "primary", color: "#4B5563", margin: "sm", action: { type: "message", label: "🩺 ความดันโลหิตสูง", text: "ความดันโลหิตสูง" } },
          { type: "button", style: "primary", color: "#4B5563", margin: "sm", action: { type: "message", label: "🩸 เบาหวาน", text: "เบาหวาน" } }
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
          { type: "text", text: "👤 ลงทะเบียนประวัติ (1/7)", color: "#CCFBF1", weight: "bold", size: "xs" },
          { type: "text", text: title, color: COLORS.WHITE, weight: "bold", size: "sm", margin: "xs", wrap: true }
        ]
      },
      body: {
        type: "box", layout: "vertical",
        contents: [
          { type: "button", style: "primary", color: COLORS.SECONDARY, margin: "xs", action: { type: "message", label: "🙋‍♂️ ชาย (Male)", text: "ชาย" } },
          { type: "button", style: "primary", color: "#0284C7", margin: "md", action: { type: "message", label: "🙋‍♀️ หญิง (Female)", text: "หญิง" } }
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
      type: 'text', text: `${prefix}📋 ${question.text}\n\nคำตอบที่ตรงกับตัวคุณในช่วงนี้มากที่สุด:`,
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

  // คำนวณเป้าหมายน้ำดื่ม (ml) & ก้าวเดิน จากสรีระจริง
  const target_water_ml = Math.round(weight * 33);
  let target_steps = 10000;
  if (bmi < 18.5) target_steps = 8000;
  else if (bmi >= 23.0) target_steps = 11000;

  await supabase.from('user_profiles').upsert({
    user_id: userId, gender, age, user_type, chronic_disease, dietary_restriction, lifestyle, weight, height, bmi, bmr, tdee, target_water_ml, target_steps
  }, { onConflict: 'user_id' });
}

app.listen(process.env.PORT || 3000, () => {
  console.log('Server runs with Daily Health Mission System!');
});