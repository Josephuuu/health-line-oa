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

app.get('/', (req, res) => res.send('Health Bot v3 with Full Flex Message is running!'));

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
                       `1️⃣ [ลงทะเบียนประวัติสุขภาพ] (แก้ไขข้อมูลเริ่มต้น)\n` +
                       `2️⃣ [อัปเดตน้ำหนัก/ส่วนสูง] (ปรับสัดส่วนปัจจุบันเพื่อคำนวณ BMI ใหม่)\n` +
                       `3️⃣ [บันทึกสุขภาพรายวัน] (เช็กอินความรู้สึกและอาการป่วยวันต่อวัน)\n` +
                       `4️⃣ [แนะนำอาหารลดน้ำหนักโรงอาหาร] (สุ่มคัดสรรเมนูตามแคลอรีเฉพาะบุคคล)\n` +
                       `5️⃣ [ค้นหาโภชนาการเมนูโรงอาหาร] (ค้นหาแคล/คาร์บ/โปรตีน จากคลัง 158+ เมนู)\n` +
                       `6️⃣ [แบบทดสอบสุขภาพจิตรายเดือน] (ทำประเมินสุขภาพจิตและสภาวะอารมณ์)\n\n` +
                       `👉 พิมพ์หมายเลขเมนู เลือกปุ่มริชเมนู หรือพิมพ์ "เมนูหลัก" ได้ตลอดเวลาครับ`;

  if (userMessage === 'กลับหน้าหลัก' || userMessage === 'เมนูหลัก' || userMessage === 'เมนู') {
    await updateState(userId, 'MAIN_MENU', {});
    return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: mainMenuText }] });
  }

  // ==========================================
  // 📥 MAIN MENU
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

    // เมนู 3: บันทึกประจำวัน (Flex Card)
    if (userMessage === '3' || userMessage.includes('บันทึกประจำวัน')) {
      await updateState(userId, 'DAILY_MOOD', {});
      const moodCard = {
        type: "flex",
        altText: "วันนี้คุณรู้สึกอย่างไรบ้างครับ?",
        contents: {
          type: "bubble",
          header: {
            type: "box",
            layout: "vertical",
            backgroundColor: "#FF9800",
            contents: [
              { type: "text", text: "🌤️ บันทึกสุขภาพประจำวัน", color: "#FFFFFF", weight: "bold", size: "lg" },
              { type: "text", text: "วันนี้คุณรู้สึกอย่างไรบ้างครับ?", color: "#FFF3E0", size: "xs", margin: "xs" }
            ]
          },
          body: {
            type: "box",
            layout: "vertical",
            contents: [
              { type: "button", style: "primary", color: "#4CAF50", margin: "xs", action: { type: "message", label: "😊 มีความสุข / สดชื่น", text: "มีความสุข" } },
              { type: "button", style: "primary", color: "#2196F3", margin: "sm", action: { type: "message", label: "😐 ปกติธรรมดา", text: "ปกติ" } },
              { type: "button", style: "primary", color: "#FF9800", margin: "sm", action: { type: "message", label: "😴 เหนื่อยล้า / อ่อนเพลีย", text: "เหนื่อยล้า" } },
              { type: "button", style: "primary", color: "#F44336", margin: "sm", action: { type: "message", label: "😫 เครียด / กังวล", text: "เครียด" } }
            ]
          }
        }
      };
      return client.replyMessage({ replyToken: event.replyToken, messages: [moodCard] });
    }

    // เมนู 4: แนะนำอาหาร (Flex Card)
    if (userMessage === '4' || userMessage.includes('แนะนำอาหาร')) {
      const tdee = profile?.tdee || 2000;
      const targetCal = Math.round((tdee - 500) / 3);
      const chronicDisease = profile?.chronic_disease || 'ไม่มี';

      let { data: fitMenus } = await supabase.from('canteen_menus').select('*').lte('calories', targetCal).limit(30);
      if (!fitMenus || fitMenus.length === 0) {
        let { data: fallback } = await supabase.from('canteen_menus').select('*').limit(10);
        fitMenus = fallback || [];
      }

      const randomSelected = fitMenus.sort(() => 0.5 - Math.random()).slice(0, 3);
      const menuContents = randomSelected.map((item, idx) => ({
        type: "box",
        layout: "horizontal",
        margin: "md",
        contents: [
          { type: "text", text: `${idx + 1}. ${item.menu_name}`, size: "sm", color: "#111111", flex: 4, weight: "bold" },
          { type: "text", text: `${item.calories} kcal`, size: "sm", color: "#22B573", align: "end", flex: 2, weight: "bold" }
        ]
      }));

      const flexMenuCard = {
        type: "flex",
        altText: "🍱 เมนูอาหารคัดสรรแนะนำประจำมื้อนี้",
        contents: {
          type: "bubble",
          header: {
            type: "box",
            layout: "vertical",
            backgroundColor: "#22B573",
            contents: [
              { type: "text", text: "🍱 เมนูแนะนำเพื่อสุขภาพ", weight: "bold", size: "lg", color: "#FFFFFF" },
              { type: "text", text: `เป้าหมายมื้อนี้: ไม่เกิน ${targetCal} kcal`, size: "xs", color: "#E0F7FA", margin: "xs" }
            ]
          },
          body: {
            type: "box",
            layout: "vertical",
            contents: [
              { type: "text", text: `🩺 โรคประจำตัว: ${chronicDisease}`, size: "xs", color: "#666666" },
              { type: "separator", margin: "md" },
              { type: "text", text: "💡 เมนูแนะนำคัดสรรจากโรงอาหาร:", size: "xs", color: "#999999", margin: "md" },
              ...menuContents,
              { type: "separator", margin: "lg" },
              { type: "text", text: chronicDisease.includes('ความดัน') ? "⚠️ หลีกเลี่ยงน้ำซุปหรือเมนูรสจัด เพื่อลดโซเดียม" : "✨ เลือกทานอาหารให้หลากหลาย และดื่มน้ำตามมากๆ นะครับ", size: "xs", color: "#FF5722", wrap: true, margin: "md" }
            ]
          },
          footer: {
            type: "box",
            layout: "vertical",
            contents: [
              { type: "button", style: "primary", color: "#22B573", action: { type: "message", label: "🎲 สุ่มเมนูใหม่อีกครั้ง", text: "4" } }
            ]
          }
        }
      };
      return client.replyMessage({ replyToken: event.replyToken, messages: [flexMenuCard] });
    }

    // เมนู 5: ค้นหาโภชนาการ
    if (userMessage === '5' || userMessage.includes('ค้นหา')) {
      await updateState(userId, 'SEARCH_NUTRIENT', {});
      let searchIntro = `🔍 [โหมดค้นหาคุณค่าทางโภชนาการเมนูโรงอาหาร]\n\n`;
      searchIntro += `โปรดพิมพ์ชื่อเมนูหรือคำสำคัญที่ต้องการค้นหามาได้เลยครับ (ระบบจะค้นจากคลัง 158+ เมนู)\n\n`;
      searchIntro += `*(ตัวอย่าง: พิมพ์คำว่า "กะเพรา", "แกง", "ไก่", "หมู" หรือชื่อเมนูเต็มได้เลยครับ)*`;
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: searchIntro }] });
    }

    // เมนู 6: ประเมินสุขภาพจิต
    if (userMessage === '6' || userMessage.includes('สุขภาพจิต')) {
      currentContext.current_q = 1;
      currentContext.scores = {};
      await updateState(userId, 'MONTHLY_MENTAL', currentContext);
      return sendMentalQuestion(event, 1, '🧠 [แบบทดสอบสุขภาพจิตประจำเดือน]\nเพื่อประเมินระดับสภาวะอารมณ์และจิตใจของคุณในรอบเดือนนี้ มาเริ่มกันเลยครับ!\n\n');
    }
  }

  // ==========================================
  // ⚡ CONTROL STATES MACHINE
  // ==========================================
  switch (currentState) {
    
    case 'REG_GENDER':
      if (userMessage !== 'ชาย' && userMessage !== 'หญิง') return replyErr(event, 'โปรดกดเลือก "ชาย" หรือ "หญิง" จากการ์ดด้านบนครับ');
      currentContext.gender = userMessage;
      await updateState(userId, 'REG_AGE', currentContext);
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'คุณอายุเท่าไหร่ครับ? (กรอกเป็นตัวเลข เช่น 25)' }] });

    case 'REG_AGE':
      const age = parseInt(userMessage);
      if (isNaN(age) || age <= 0 || age > 110) return replyErr(event, 'โปรดระบุอายุเป็นตัวเลขที่ถูกต้องครับ');
      currentContext.age = age;
      await updateState(userId, 'REG_DISEASE', currentContext);
      
      // Flex Card เลือกโรคประจำตัว
      const diseaseCard = {
        type: "flex",
        altText: "โปรดเลือกโรคประจำตัวของคุณ",
        contents: {
          type: "bubble",
          header: {
            type: "box", layout: "vertical", backgroundColor: "#0288D1",
            contents: [
              { type: "text", text: "🩺 ประวัติสุขภาพ (3/5)", color: "#FFFFFF", weight: "bold", size: "xs" },
              { type: "text", text: "คุณมีโรคประจำตัวหรือไม่ครับ?", color: "#FFFFFF", weight: "bold", size: "md", margin: "xs" }
            ]
          },
          body: {
            type: "box", layout: "vertical",
            contents: [
              { type: "button", style: "primary", color: "#4CAF50", margin: "xs", action: { type: "message", label: "❌ ไม่มีโรคประจำตัว", text: "ไม่มี" } },
              { type: "button", style: "secondary", color: "#0288D1", margin: "sm", action: { type: "message", label: "🩺 ความดันโลหิตสูง", text: "ความดันโลหิตสูง" } },
              { type: "button", style: "secondary", color: "#0288D1", margin: "sm", action: { type: "message", label: "🩸 เบาหวาน", text: "เบาหวาน" } },
              { type: "button", style: "secondary", color: "#0288D1", margin: "sm", action: { type: "message", label: "🫀 โรคหัวใจ", text: "โรคหัวใจ" } }
            ]
          }
        }
      };
      return client.replyMessage({ replyToken: event.replyToken, messages: [diseaseCard] });

    case 'REG_DISEASE':
      currentContext.chronic_disease = userMessage;
      await updateState(userId, 'REG_LIFESTYLE', currentContext);

      // Flex Card เลือกพฤติกรรม
      const lifestyleCard = {
        type: "flex",
        altText: "โปรดเลือกพฤติกรรมการใช้ชีวิต",
        contents: {
          type: "bubble",
          header: {
            type: "box", layout: "vertical", backgroundColor: "#7B1FA2",
            contents: [
              { type: "text", text: "🏃‍♂️ พฤติกรรมประจำวัน (4/5)", color: "#FFFFFF", weight: "bold", size: "xs" },
              { type: "text", text: "พฤติกรรมการใช้ชีวิตของคุณเป็นอย่างไร?", color: "#FFFFFF", weight: "bold", size: "sm", margin: "xs" }
            ]
          },
          body: {
            type: "box", layout: "vertical",
            contents: [
              { type: "button", style: "primary", color: "#7B1FA2", margin: "xs", action: { type: "message", label: "🖥️ นั่งทำงาน / เรียนหนังสือ", text: "นั่งทำงานทั่วไป" } },
              { type: "button", style: "primary", color: "#7B1FA2", margin: "sm", action: { type: "message", label: "🛠️ ทำงานหนัก / ออกแรงมาก", text: "ทำงานหนักใช้แรง" } },
              { type: "button", style: "primary", color: "#7B1FA2", margin: "sm", action: { type: "message", label: "🚬 สูบบุหรี่ หรือ ดื่มสุรา", text: "สูบบุหรี่หรือดื่ม" } }
            ]
          }
        }
      };
      return client.replyMessage({ replyToken: event.replyToken, messages: [lifestyleCard] });

    case 'REG_LIFESTYLE':
      const validLifestyles = ['นั่งทำงานทั่วไป', 'ทำงานหนักใช้แรง', 'สูบบุหรี่หรือดื่ม'];
      if (!validLifestyles.includes(userMessage)) {
        return replyErr(event, 'โปรดเลือกพฤติกรรมจากปุ่มบนการ์ดเท่านั้นครับ');
      }

      currentContext.lifestyle = userMessage;
      await updateState(userId, 'REG_WEIGHT', currentContext);
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'โปรดพิมพ์ น้ำหนัก ของคุณเป็นตัวเลข (กก.) เช่น 65' }] });

    case 'REG_WEIGHT':
      const w = parseFloat(userMessage);
      if (isNaN(w) || w <= 0) return replyErr(event, 'โปรดกรอกตัวเลขน้ำหนักที่ถูกต้องครับ');
      currentContext.weight = w;
      await updateState(userId, 'REG_HEIGHT', currentContext);
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'โปรดพิมพ์ ส่วนสูง ของคุณเป็นตัวเลข (ซม.) เช่น 170' }] });

    case 'REG_HEIGHT':
      const h = parseFloat(userMessage);
      if (isNaN(h) || h <= 0) return replyErr(event, 'โปรดกรอกตัวเลขส่วนสูงที่ถูกต้องครับ');
      
      await saveUserProfile(userId, currentContext.gender, currentContext.age, currentContext.chronic_disease, currentContext.lifestyle, currentContext.weight, h);
      await updateState(userId, 'MAIN_MENU', {});
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: '🎉 ลงทะเบียนประวัติสุขภาพเสร็จสมบูรณ์เรียบร้อยครับ!\n\n' + mainMenuText }] });

    case 'UPDATE_WEIGHT':
      const uw = parseFloat(userMessage);
      if (isNaN(uw) || uw <= 0) return replyErr(event, 'โปรดระบุน้ำหนักเป็นตัวเลขครับ');
      currentContext.weight = uw;
      await updateState(userId, 'UPDATE_HEIGHT', currentContext);
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'โปรดพิมพ์ ส่วนสูง ของคุณเป็นตัวเลข (ซม.) เช่น 170' }] });

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

      // Flex Card ใบเสร็จสรุปรายวัน
      const dailySummaryCard = {
        type: "flex",
        altText: "📝 สรุปบันทึกสุขภาพรายวัน",
        contents: {
          type: "bubble",
          header: {
            type: "box", layout: "vertical", backgroundColor: "#FF9800",
            contents: [
              { type: "text", text: "📝 บันทึกสุขภาพสำเร็จ", color: "#FFFFFF", weight: "bold", size: "md" },
              { type: "text", text: `ประจำวันที่ ${todayStr}`, color: "#FFF3E0", size: "xs", margin: "xs" }
            ]
          },
          body: {
            type: "box", layout: "vertical",
            contents: [
              { type: "text", text: `• ความรู้สึกวันนี้: ${currentContext.mood}`, size: "sm", color: "#333333" },
              { type: "text", text: `• อาการป่วยทางกาย: ${userMessage}`, size: "sm", color: "#333333", margin: "xs" },
              { type: "separator", margin: "md" },
              { type: "text", text: "บันทึกข้อมูลลงคลังเรียบร้อยครับ พรุ่งนี้มาเช็กอินใหม่นะ!", size: "xs", color: "#888888", margin: "md" }
            ]
          }
        }
      };
      return client.replyMessage({ replyToken: event.replyToken, messages: [dailySummaryCard, { type: 'text', text: mainMenuText }] });

    // 🌟 เมนู 5: แสดงผลค้นหาเป็น Flex Message การ์ดเมนูอาหาร
    case 'SEARCH_NUTRIENT':
      const keyword = userMessage.trim();

      let { data: matchedMenus } = await supabase
        .from('canteen_menus')
        .select('*')
        .ilike('menu_name', `%${keyword}%`)
        .limit(3);

      if (matchedMenus && matchedMenus.length > 0) {
        const bubbles = matchedMenus.map((meal) => ({
          type: "bubble",
          header: {
            type: "box", layout: "vertical", backgroundColor: "#009688",
            contents: [
              { type: "text", text: meal.menu_name, weight: "bold", size: "md", color: "#FFFFFF", wrap: true },
              { type: "text", text: `🔥 พลังงาน: ${meal.calories || '-'} kcal`, size: "xs", color: "#E0F2F1", margin: "xs" }
            ]
          },
          body: {
            type: "box", layout: "vertical",
            contents: [
              { type: "text", text: `🍞 คาร์โบไฮเดรต: ${meal.carbs || '-'} g`, size: "xs", color: "#555555" },
              { type: "text", text: `🥩 โปรตีน: ${meal.protein || '-'} g`, size: "xs", color: "#555555", margin: "xs" },
              { type: "text", text: `🥑 ไขมัน: ${meal.fat || '-'} g`, size: "xs", color: "#555555", margin: "xs" },
              { type: "separator", margin: "md" },
              { type: "text", text: meal.note ? `ℹ️ ${meal.note}` : "✨ เมนูโภชนาการมาตรฐานโรงอาหาร", size: "xs", color: "#00796B", wrap: true, margin: "md" }
            ]
          }
        }));

        const searchFlexCarousel = {
          type: "flex",
          altText: `ผลการค้นหาเมนู "${keyword}"`,
          contents: { type: "carousel", contents: bubbles }
        };

        return client.replyMessage({ replyToken: event.replyToken, messages: [searchFlexCarousel] });
      } else {
        return client.replyMessage({ 
          replyToken: event.replyToken, 
          messages: [{ type: 'text', text: `❌ ไม่พบเมนู "${userMessage}" ในฐานข้อมูล 158 รายการ\n\nลองพิมพ์คำสั้นๆ เช่น "ไก่", "หมู", "แกง" หรือพิมพ์ "เมนูหลัก" เพื่อออกจากการค้นหาครับ` }] 
        });
      }

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
        let headerBg = totalScore <= 5 ? "#E53935" : "#4CAF50";
        
        await supabase.from('mental_health_scores').insert({ user_id: userId, total_score: totalScore, result_text: mentalResult });
        await updateState(userId, 'MAIN_MENU', {});

        // Flex Card สรุปผลสุขภาพจิต
        const mentalResultCard = {
          type: "flex",
          altText: "🧠 รายงานผลประเมินสุขภาพจิต",
          contents: {
            type: "bubble",
            header: {
              type: "box", layout: "vertical", backgroundColor: headerBg,
              contents: [
                { type: "text", text: "🧠 ผลประเมินสุขภาพจิต", color: "#FFFFFF", weight: "bold", size: "md" },
                { type: "text", text: "ประเมินสภาวะใจรายเดือน", color: "#FFFFFF", size: "xs", margin: "xs" }
              ]
            },
            body: {
              type: "box", layout: "vertical",
              contents: [
                { type: "text", text: `📊 คะแนนรวม: ${totalScore} / 15 คะแนน`, weight: "bold", size: "md", color: "#333333" },
                { type: "text", text: `🔍 วิเคราะห์: ${mentalResult}`, weight: "bold", size: "sm", color: headerBg, margin: "sm", wrap: true },
                { type: "separator", margin: "md" },
                { type: "text", text: "ขอบคุณที่ร่วมประเมินสภาวะใจอย่างสม่ำเสมอครับ ยินดีต้อนรับกลับเข้าสู่หน้าหลัก", size: "xs", color: "#888888", margin: "md", wrap: true }
              ]
            }
          }
        };

        return client.replyMessage({ replyToken: event.replyToken, messages: [mentalResultCard, { type: 'text', text: mainMenuText }] });
      }
  }

  if (currentState === 'MAIN_MENU') {
    return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: mainMenuText }] });
  }
}

// ฟังก์ชันส่งการ์ดเลือกเพศ Flex Message
function getGenderFlexCard(title) {
  return {
    type: "flex",
    altText: "โปรดเลือกเพศของคุณ",
    contents: {
      type: "bubble",
      header: {
        type: "box", layout: "vertical", backgroundColor: "#1E88E5",
        contents: [
          { type: "text", text: "👤 ลงทะเบียนประวัติ (1/5)", color: "#FFFFFF", weight: "bold", size: "xs" },
          { type: "text", text: title, color: "#FFFFFF", weight: "bold", size: "sm", margin: "xs", wrap: true }
        ]
      },
      body: {
        type: "box", layout: "vertical",
        contents: [
          { type: "button", style: "primary", color: "#2196F3", margin: "xs", action: { type: "message", label: "🙋‍♂️ ชาย (Male)", text: "ชาย" } },
          { type: "button", style: "primary", color: "#E91E63", margin: "md", action: { type: "message", label: "🙋‍♀️ หญิง (Female)", text: "หญิง" } }
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
  console.log('Server runs with Full Flex Messages!');
});