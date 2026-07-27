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

// 🧠 รายการคำถามแบบทดสอบสุขภาพจิตคนไทย (TMHI-55)
const MENTAL_QUESTIONS = [
  { id: 1, text: "1. ท่านรู้สึกพึงพอใจในชีวิต", reverse: false },
  { id: 2, text: "2. ท่านรู้สึกสบายใจ", reverse: false },
  { id: 3, text: "3. ท่านรู้สึกสดชื่นเบิกบานใจ", reverse: false },
  { id: 4, text: "4. ท่านรู้สึกชีวิตของท่านมีความสุขสงบ (ความสงบสุขในจิตใจ)", reverse: false },
  { id: 5, text: "5. ท่านรู้สึกเบื่อหน่ายท้อแท้กับการดำเนินชีวิตประจำวัน", reverse: true },
  { id: 6, text: "6. ท่านรู้สึกผิดหวังในตัวเอง", reverse: true },
  { id: 7, text: "7. ท่านรู้สึกว่าชีวิตของท่านมีแต่ความทุกข์", reverse: true },
  { id: 8, text: "8. ท่านรู้สึกกังวลใจ", reverse: true },
  { id: 9, text: "9. ท่านรู้สึกเศร้าโดยไม่ทราบสาเหตุ", reverse: true },
  { id: 10, text: "10. ท่านรู้สึกโกรธหงุดหงิดง่ายโดยไม่ทราบสาเหตุ", reverse: true },
  { id: 11, text: "11. ท่านต้องไปรับการรักษาพยาบาลเสมอๆ เพื่อให้สามารถดำเนินชีวิตและทำงานได้", reverse: true },
  { id: 12, text: "12. ท่านเป็นโรคเรื้อรัง (เบาหวาน ความดันโลหิตสูง อัมพาต ลมชัก ฯลฯ)", reverse: true },
  { id: 13, text: "13. ท่านรู้สึกกังวลหรือทุกข์ทรมานใจเกี่ยวกับการเจ็บป่วยของท่าน", reverse: true },
  { id: 14, text: "14. ท่านพอใจต่อการผูกมิตรหรือเข้ากับบุคคลอื่น", reverse: false },
  { id: 15, text: "15. ท่านมีสัมพันธภาพที่ดีกับเพื่อนบ้าน", reverse: false },
  { id: 16, text: "16. ท่านมีสัมพันธภาพที่ดีกับเพื่อนร่วมงาน (ทำงานร่วมกับคนอื่น)", reverse: false },
  { id: 17, text: "17. ท่านคิดว่าท่านมีความเป็นอยู่และฐานะทางสังคม ตามที่ท่านได้คาดหวังไว้", reverse: false },
  { id: 18, text: "18. ท่านรู้สึกประสบความสำเร็จและความก้าวหน้าในชีวิต", reverse: false },
  { id: 19, text: "19. ท่านรู้สึกพึงพอใจกับฐานะความเป็นอยู่ของท่าน", reverse: false },
  { id: 20, text: "20. ท่านเห็นว่าปัญหาส่วนใหญ่เป็นสิ่งที่แก้ไขได้", reverse: false },
  { id: 21, text: "21. ท่านสามารถทำใจยอมรับได้สำหรับปัญหาที่ยากจะแก้ไข (เมื่อมีปัญหา)", reverse: false },
  { id: 22, text: "22. ท่านมั่นใจว่าจะสามารถควบคุมอารมณ์ได้ เมื่อมีเหตุการณ์คับขันหรือร้ายแรงเกิดขึ้น", reverse: false },
  { id: 23, text: "23. ท่านมั่นใจที่จะเผชิญกับเหตุการณ์ร้ายแรงที่เกิดขึ้นในชีวิต", reverse: false },
  { id: 24, text: "24. ท่านแก้ปัญหาที่ขัดแย้งได้", reverse: false },
  { id: 25, text: "25. ท่านจะรู้สึกหงุดหงิด ถ้าสิ่งต่างๆ ไม่เป็นไปตามที่คาดหวัง", reverse: true },
  { id: 26, text: "26. ท่านหงุดหงิดโมโหง่ายถ้าท่านถูกวิพากษ์วิจารณ์", reverse: true },
  { id: 27, text: "27. ท่านรู้สึกหงุดหงิด กังวลใจกับเรื่องเล็กๆน้อยๆ ที่เกิดขึ้นเสมอ", reverse: true },
  { id: 28, text: "28. ท่านรู้สึกกังวลใจกับเรื่องทุกเรื่องที่มากระทบตัวท่าน", reverse: true },
  { id: 29, text: "29. ท่านรู้สึกยินดีกับความสำเร็จของคนอื่น", reverse: false },
  { id: 30, text: "30. ท่านรู้สึกเห็นใจเมื่อผู้อื่นมีทุกข์", reverse: false },
  { id: 31, text: "31. ท่านรู้สึกเป็นสุขในการช่วยเหลือผู้อื่นเมื่อมีโอกาส", reverse: false },
  { id: 32, text: "32. ท่านให้ความช่วยเหลือแก่ผู้อื่นเมื่อมีโอกาส", reverse: false },
  { id: 33, text: "33. ท่านเสียสละแรงกายหรือทรัพย์สินเพื่อประโยชน์ส่วนรวมโดยไม่หวังผลตอบแทน", reverse: false },
  { id: 34, text: "34. หากมีสถานการณ์ที่คับขันเสี่ยงภัย ท่านพร้อมที่จะให้ความช่วยเหลือร่วมกับผู้อื่น", reverse: false },
  { id: 35, text: "35. ท่านพึงพอใจกับความสามารถของตนเอง", reverse: false },
  { id: 36, text: "36. ท่านรู้สึกภูมิใจในตนเอง", reverse: false },
  { id: 37, text: "37. ท่านรู้สึกว่าท่านมีคุณค่าต่อครอบครัว", reverse: false },
  { id: 38, text: "38. ท่านมีสิ่งยึดเหนี่ยวสูงสุดในจิตใจที่ทำให้จิตใจมั่นคงในการดำเนินชีวิต", reverse: false },
  { id: 39, text: "39. ท่านมีความเชื่อมั่นว่าเมื่อเผชิญกับความยุ่งยากท่านมีสิ่งยึดเหนี่ยวสูงสุดในจิตใจ", reverse: false },
  { id: 40, text: "40. ท่านเคยประสบกับความยุ่งยากและสิ่งยึดเหนี่ยวสูงสุดในจิตใจช่วยให้ท่านผ่านพ้นไปได้", reverse: false },
  { id: 41, text: "41. ท่านต้องการทำบางสิ่งที่ใหม่ในทางที่ดีขึ้นกว่าที่เป็นอยู่เดิม", reverse: false },
  { id: 42, text: "42. ท่านมีความสุขกับการริเริ่มงานใหม่ๆ และมุ่งมั่นที่จะทำให้สำเร็จ", reverse: false },
  { id: 43, text: "43. ท่านมีความกระตือรือร้นที่จะเรียนรู้สิ่งใหม่ๆ ในทางที่ดี", reverse: false },
  { id: 44, text: "44. ท่านมีเพื่อนหรือคนอื่นๆ ในสังคมคอยช่วยเหลือท่านในยามที่ต้องการ", reverse: false },
  { id: 45, text: "45. ท่านได้รับความช่วยเหลือตามที่ท่านต้องการจากเพื่อนหรือคนอื่นๆในสังคม", reverse: false },
  { id: 46, text: "46. ท่านรู้สึกมั่นคง ปลอดภัยเมื่ออยู่ในครอบครัว", reverse: false },
  { id: 47, text: "47. หากท่านป่วยหนัก ท่านเชื่อว่าครอบครัวจะดูแลท่านเป็นอย่างดี", reverse: false },
  { id: 48, text: "48. ท่านปรึกษาหรือขอความช่วยเหลือจากครอบครัวเสมอเมื่อท่านมีปัญหา", reverse: false },
  { id: 49, text: "49. สมาชิกในครอบครัวมีความรักและผูกพันต่อกัน", reverse: false },
  { id: 50, text: "50. ท่านมั่นใจว่าชุมชนที่ท่านอาศัยอยู่มีความปลอดภัยต่อท่าน", reverse: false },
  { id: 51, text: "51. ท่านรู้สึกมั่นคงปลอดภัยในทรัพย์สินเมื่ออาศัยอยู่ในชุมชนนี้", reverse: false },
  { id: 52, text: "52. มีหน่วยงานสาธารณสุขใกล้บ้านที่ท่านสามารถไปใช้บริการได้", reverse: false },
  { id: 53, text: "53. หน่วยงานสาธารณสุขใกล้บ้านสามารถไปให้บริการได้เมื่อท่านต้องการ", reverse: false },
  { id: 54, text: "54. เมื่อท่านหรือญาติเจ็บป่วยจะใช้บริการจากหน่วยงานสาธารณสุขใกล้บ้าน", reverse: false },
  { id: 55, text: "55. เมื่อท่านเดือดร้อนจะมีหน่วยงานในชุมชนมาช่วยเหลือดูแลท่าน", reverse: false }
];

const NEGATIVE_KEYWORDS = ['เครียด', 'เหนื่อย', 'ท้อ', 'แย่', 'เศร้า', 'กังวล', 'ไม่ไหว', 'เจ็บ', 'ปวด', 'นอนไม่หลับ', 'เบื่อ'];

// ==========================================
// 🛠️ HELPER: ระบบขยายคำค้นหาแบบอัจฉริยะ (Smart Query Expansion)
// ==========================================
function buildSmartSearchTerms(userInput) {
  const cleanInput = userInput.trim();
  let terms = [cleanInput];

  // 1. กรณีผู้ใช้พิมพ์เว้นวรรค เช่น "Chicken Dozo" -> เพิ่ม "chickendozo"
  const noSpace = cleanInput.replace(/\s+/g, '');
  if (noSpace !== cleanInput) {
    terms.push(noSpace);
  }

  // 2. กรณีแมปคำภาษาไทยถอดเสียงเป็นภาษาอังกฤษสำหรับร้าน chickendozo
  if (/ชิคเก้น|โดโซ|chickendozo|chicken dozo/i.test(cleanInput)) {
    terms.push('chickendozo');
  }

  // 3. กรณีพิมพ์เฉพาะตัวเลข เช่น "2", "4", "9"
  if (/^\d+$/.test(cleanInput)) {
    terms.push(`ร้านที่ ${cleanInput}`);
    terms.push(`ร้านที่${cleanInput}`);
  }

  // 4. กรณีพิมพ์คำว่า "ร้าน..." หรือ ตัดคำว่า "ร้าน" ออก
  if (cleanInput.startsWith('ร้าน')) {
    const withoutRan = cleanInput.replace(/^ร้าน/, '').trim();
    if (withoutRan) terms.push(withoutRan);
  }

  // ตัดคำซ้ำออก
  return [...new Set(terms)];
}

// ==========================================
// ⏰ PERSONALIZED NOTIFICATION SCHEDULER
// ==========================================
async function broadcastPersonalizedNotification(timeOfDay) {
  try {
    const { data: users, error } = await supabase.from('user_profiles').select('user_id');
    if (error || !users || users.length === 0) return;

    const todayStr = new Date().toISOString().split('T')[0];

    const pushPromises = users.map(async (u) => {
      const [mentalRes, progressRes] = await Promise.all([
        supabase.from('mental_health_scores').select('total_score').eq('user_id', u.user_id).single(),
        supabase.from('daily_progress').select('mood_today, symptoms_today').eq('user_id', u.user_id).eq('log_date', todayStr).single()
      ]);

      const mentalScore = mentalRes.data?.total_score || 0;
      const moodText = progressRes.data?.mood_today || '';
      const symptomText = progressRes.data?.symptoms_today || '';

      const isNegativeMood = NEGATIVE_KEYWORDS.some(kw => moodText.includes(kw) || symptomText.includes(kw));
      const isHighStress = mentalScore < 110 && mentalScore > 0;

      let pushText = '';

      if (timeOfDay === 'MORNING') {
        pushText = '🌅 สวัสดีตอนเช้าครับ!\n\nอย่าลืมดื่มน้ำ 1 แก้วเพื่อปลุกร่างกายให้สดชื่นนะครับ 💧';
        if (isNegativeMood || isHighStress) {
          pushText += '\n\n💙 สู้ๆ นะครับ! ไม่ว่าจะเจอเรื่องหนักแค่ไหน ยิ้มรับวันใหม่ แล้วค่อยๆ ผ่านมันไปทีละนิดครับ ✨';
        } else {
          pushText += '\n\n🎯 วันนี้มาพิชิตภารกิจสุขภาพประจำวันกัน! พิมพ์ "2" หรือ "ภารกิจ" เพื่อเริ่มได้เลยครับ';
        }
      } else if (timeOfDay === 'AFTERNOON') {
        pushText = '☀️ พักสายตา ยืดเส้นยืดสายกันหน่อยครับ! 🧘‍♂️\n\nขยับร่างกายสัก 1-2 นาที จิบน้ำเติมพลังกันนะ';
        if (isNegativeMood || isHighStress) {
          pushText += '\n\n🤗 ถ้ารู้สึกเหนื่อยหรือเครียด ลองสูดหายใจลึกๆ 3 วินาที แล้วผ่อนคลายไหล่ดูนะครับ คุณทำดีที่สุดแล้ว!';
        }
      } else if (timeOfDay === 'EVENING') {
        pushText = '🌆 โค้งสุดท้ายของวันแล้วครับ! 🎯\n\nวันนี้ดื่มน้ำ เดินสะสม หรือยืดตัวครบเป้าหมายหรือยังครับ?';
        if (isNegativeMood || isHighStress) {
          pushText += '\n\n🌙 คืนนี้พักผ่อนเยอะๆ ปล่อยวางเรื่องหนักใจไว้ข้างนอก แล้วพักผ่อนกายใจให้เต็มที่นะครับ 💪✨';
        }
      }

      return client.pushMessage({
        to: u.user_id,
        messages: [{ type: 'text', text: pushText }]
      }).catch(err => console.error(`Failed push to ${u.user_id}:`, err));
    });

    await Promise.allSettled(pushPromises);
  } catch (err) {
    console.error('Broadcast Notification Error:', err);
  }
}

cron.schedule('0 8 * * *', () => broadcastPersonalizedNotification('MORNING'), { timezone: "Asia/Bangkok" });
cron.schedule('0 14 * * *', () => broadcastPersonalizedNotification('AFTERNOON'), { timezone: "Asia/Bangkok" });
cron.schedule('0 20 * * *', () => broadcastPersonalizedNotification('EVENING'), { timezone: "Asia/Bangkok" });

app.get('/ping', (req, res) => res.send('Server is Alive!'));
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

  const [stateRes, profileRes] = await Promise.all([
    supabase.from('user_states').select('state, context').eq('user_id', userId).single(),
    supabase.from('user_profiles').select('*').eq('user_id', userId).single()
  ]);

  let stateData = stateRes.data;
  let profile = profileRes.data;

  let currentState = stateData ? stateData.state : 'MAIN_MENU';
  let currentContext = stateData && stateData.context ? stateData.context : {};

  if (!stateData) {
    await supabase.from('user_states').insert({ user_id: userId, state: 'MAIN_MENU', context: {} });
    currentState = 'MAIN_MENU';
  }

  if (userMessage.includes('ลงทะเบียนประวัติสุขภาพ') || userMessage === 'ลงทะเบียน') {
    await updateState(userId, 'REG_GENDER', {});
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [getGenderFlexCard('🧪 [โหมดทดสอบ] เริ่มลงทะเบียนประวัติสุขภาพใหม่ครับ')]
    });
  }

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
                       `3️⃣ [แบบทดสอบสุขภาพจิต 55 ข้อ]\n` +
                       `4️⃣ [แนะนำอาหารลดน้ำหนัก]\n` +
                       `5️⃣ [อัปเดตสัดส่วน & โรคประจำตัว]\n` +
                       `6️⃣ [ประเมินความพึงพอใจ]\n\n` +
                       `👉 กดปุ่มบน Rich Menu หรือพิมพ์ตัวเลข 1-5 ได้เลยครับ!`;

  if (userMessage === 'กลับหน้าหลัก' || userMessage === 'เมนูหลัก' || userMessage === 'เมนู') {
    await updateState(userId, 'MAIN_MENU', {});
    return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: mainMenuText }] });
  }

  const isSearchTrigger = userMessage === '1' || /คำน?วณ|แคล|โภชนาการ|ค้นหาอาหาร/i.test(userMessage);
  const isMissionTrigger = userMessage === '2' || /ภารกิ[จต]|บันทึกประจำวัน/i.test(userMessage);
  const isMentalTrigger = userMessage === '3' || /สุข?ภาพจิต|ประเมินสุขภาพจิต|แบบทดสอบ/i.test(userMessage);
  const isFoodTrigger = userMessage === '4' || /แนะนำอาหาร|ลดน้ำหนัก|ลดความอ้วน/i.test(userMessage);
  const isUpdateBodyTrigger = userMessage === '5' || /อั[ปพ]เด[ตท]|สัดส่วน|อัปเดตสัดส่วน/i.test(userMessage);

  if (userMessage === '6') {
    return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: '📋 สำหรับการประเมินความพึงพอใจ สามารถกดปุ่มที่ 6 บน LINE Rich Menu เพื่อทำผ่าน Google Form ได้เลยครับ! 🙏' }] });
  }

  const isAnsweringTest = currentState === 'MONTHLY_MENTAL' && ['0', '1', '2', '3'].includes(userMessage);

  if ((isSearchTrigger || isMissionTrigger || isMentalTrigger || isFoodTrigger || isUpdateBodyTrigger) && !isAnsweringTest && currentState !== 'MAIN_MENU') {
    currentState = 'MAIN_MENU';
    currentContext = {};
  }

  // ==========================================
  // 📥 MAIN MENU ROUTING
  // ==========================================
  if (currentState === 'MAIN_MENU') {
    
    if (isSearchTrigger) {
      await updateState(userId, 'SEARCH_NUTRIENT', {});
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: '🔍 พิมพ์ชื่อเมนูอาหาร หรือ ชื่อร้านค้า ที่ต้องการค้นหาได้เลยครับ\n(เช่น ไก่, รุ่งเรือง, ร้านที่ 2, KFC, chickendozo)' }]
      });
    }

    if (isMissionTrigger) {
      await updateState(userId, 'MISSION_ACTION', {});
      const card = await buildMissionCard(userId, profile);
      return client.replyMessage({ replyToken: event.replyToken, messages: [card] });
    }

    if (isMentalTrigger) {
      currentContext = { current_q: 1, scores: {} };
      await updateState(userId, 'MONTHLY_MENTAL', currentContext);
      return sendMentalQuestion(event, 1, '🧠 [แบบทดสอบสุขภาพจิตคนไทย 55 ข้อ]\nค่อยๆ ทำไปทีละข้อได้เลยนะครับ ระบบจะประเมินผลให้อัตโนมัติครับ ✨\n\n');
    }

    if (isFoodTrigger) {
      await updateState(userId, 'MAIN_MENU', {});
      const tdee = profile?.tdee || 2000;
      const targetCal = Math.round((tdee - 500) / 3);
      const chronicDisease = profile?.chronic_disease || 'ไม่มี';
      const dietary = profile?.dietary_restriction || 'ไม่มี';

      let { data: allMenus } = await supabase.from('canteen_menus').select('*').lte('calories', targetCal);
      if (!allMenus || allMenus.length === 0) {
        let { data: fallback } = await supabase.from('canteen_menus').select('*').limit(60);
        allMenus = fallback || [];
      }

      const DRINK_KEYWORDS = ['น้ำ', 'ชา', 'กาแฟ', 'นม', 'น้ำอัดลม', 'ชานม', 'น้ำส้ม', 'น้ำแดง', 'โซดา', 'ปั่น', 'โอเลี้ยง', 'เก๊กฮวย'];

      let fitMenus = allMenus.filter(item => {
        const name = item.menu_name || '';

        if ((dietary.includes('อิสลาม') || dietary.includes('ฮาลาล')) && ['หมู', 'เบคอน', 'กุนเชียง', 'ตับหมู', 'หมูกรอบ', 'แคบหมู'].some(kw => name.includes(kw))) return false;
        if ((dietary.includes('มังสวิรัติ') || dietary.includes('วีแกน')) && ['หมู', 'ไก่', 'เนื้อ', 'กุ้ง', 'หมึก', 'ปลา', 'ปู', 'หอย', 'เป็ด', 'ไข่', 'ตับ'].some(kw => name.includes(kw))) return false;
        if (dietary.includes('แพ้อาหารทะเล') && ['กุ้ง', 'หมึก', 'ปลา', 'ปู', 'หอย', 'ทะเล', 'กะปิ'].some(kw => name.includes(kw))) return false;
        if (dietary.includes('แพ้ถั่ว') && ['ถั่ว', 'เต้าหู้', 'ถั่วเหลือง', 'พะแนง', 'มัสมั่น'].some(kw => name.includes(kw))) return false;

        if (chronicDisease.includes('เบาหวาน') && ['ไอศกรีม', 'ของหวาน', 'บัวลอย', 'น้ำหวาน', 'เค้ก', 'ขนม', 'ฝอยทอง', 'น้ำอัดลม'].some(kw => name.includes(kw))) return false;
        if ((chronicDisease.includes('ความดัน') || chronicDisease.includes('โรคไต')) && ['ต้มยำ', 'ส้มตำ', 'ยำ', 'น้ำตก', 'หมูกรอบ', 'ปลาเค็ม'].some(kw => name.includes(kw))) return false;

        return true;
      });

      const foodOnly = fitMenus.filter(item => !DRINK_KEYWORDS.some(kw => (item.menu_name || '').includes(kw)));
      const poolToUse = foodOnly.length >= 3 ? foodOnly : (fitMenus.length > 0 ? fitMenus : allMenus);

      const randomSelected = poolToUse.sort(() => 0.5 - Math.random()).slice(0, 3);
      
      const menuContents = randomSelected.map((item, idx) => {
        const shopText = item.shop_name ? ` (${item.shop_name})` : '';
        return {
          type: "box", layout: "horizontal", margin: "md",
          contents: [
            { type: "text", text: `${idx + 1}. ${item.menu_name}${shopText}`, size: "sm", color: COLORS.NEUTRAL_DARK, flex: 4, weight: "bold", wrap: true },
            { type: "text", text: `${item.calories} kcal`, size: "sm", color: COLORS.PRIMARY, align: "end", flex: 2, weight: "bold" }
          ]
        };
      });

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
              { type: "button", style: "primary", color: COLORS.SECONDARY, action: { type: "message", label: "🎲 สุ่มเมนูใหม่อีกครั้ง", text: "4" } }
            ]
          }
        }
      };
      return client.replyMessage({ replyToken: event.replyToken, messages: [flexMenuCard] });
    }

    if (isUpdateBodyTrigger) {
      await updateState(userId, 'UPDATE_WEIGHT', {});
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: '⚖️ มาอัปเดตน้ำหนักและส่วนสูงกันครับ!\n\nตอนนี้น้ำหนักกี่กิโลกรัมครับ? (พิมพ์ตัวเลข เช่น 52.5)' }] });
    }
  }

  // ==========================================
  // ⚡ CONTROL STATES MACHINE
  // ==========================================
  switch (currentState) {
    
    // 🔍 ⚡ ค้นหาโภชนาการ + ร้านค้า (พร้อมระบบ Smart Search คำนึงถึงการพิมพ์ผิด/ย่อ)
    case 'SEARCH_NUTRIENT':
      const searchTerms = buildSmartSearchTerms(userMessage);

      // สร้างเงื่อนไขค้นหาหลายคำพร้อมกันใน Supabase (.or)
      const orConditions = searchTerms.flatMap(term => [
        `menu_name.ilike.%${term}%`,
        `shop_name.ilike.%${term}%`
      ]).join(',');

      const { data: searchResults, error: searchError } = await supabase
        .from('canteen_menus')
        .select('*')
        .or(orConditions)
        .limit(5);

      if (searchError || !searchResults || searchResults.length === 0) {
        return client.replyMessage({
          replyToken: event.replyToken,
          messages: [{
            type: 'text',
            text: `❌ ไม่พบข้อมูลของ "${userMessage}" ครับ\n\n💡 ลองพิมพ์ค้นหาด้วยชื่อเมนูหรือชื่อร้าน เช่น "รุ่งเรือง", "ไก่ทอด", "KFC", "ร้านที่ 2" หรือพิมพ์ "กลับหน้าหลัก" เพื่อยกเลิกครับ`
          }]
        });
      }

      const resultContents = searchResults.map((item) => {
        const shopText = item.shop_name ? ` (${item.shop_name})` : '';
        return {
          type: "box", layout: "vertical", margin: "md",
          contents: [
            { type: "text", text: `🍛 ${item.menu_name}${shopText}`, weight: "bold", size: "sm", color: COLORS.NEUTRAL_DARK, wrap: true },
            {
              type: "box", layout: "horizontal", margin: "xs",
              contents: [
                { type: "text", text: `🔥 พลังงาน: ${item.calories || 0} kcal`, size: "xs", color: COLORS.PRIMARY, weight: "bold" },
                { type: "text", text: `🥩 โปรตีน: ${item.protein_g || 0}g`, size: "xs", color: "#6B7280", align: "end" }
              ]
            }
          ]
        };
      });

      const searchCard = {
        type: "flex", altText: `ผลการค้นหา: ${userMessage}`,
        contents: {
          type: "bubble",
          header: {
            type: "box", layout: "vertical", backgroundColor: COLORS.PRIMARY,
            contents: [
              { type: "text", text: "🔍 ผลการค้นหาโภชนาการ", color: COLORS.WHITE, weight: "bold", size: "md" },
              { type: "text", text: `คำค้นหา: "${userMessage}"`, color: "#CCFBF1", size: "xs", margin: "xs" }
            ]
          },
          body: {
            type: "box", layout: "vertical",
            contents: [
              ...resultContents,
              { type: "separator", margin: "md" },
              { type: "text", text: "💡 สามารถพิมพ์ค้นหาเมนูหรือชื่อร้านอื่นต่อได้เลย หรือพิมพ์ 'กลับหน้าหลัก' ครับ", size: "xs", color: "#9CA3AF", margin: "md", wrap: true }
            ]
          }
        }
      };

      return client.replyMessage({ replyToken: event.replyToken, messages: [searchCard] });

    case 'MISSION_ACTION':
      const todayStr = new Date().toISOString().split('T')[0];

      if (userMessage === 'ระบุปริมาณน้ำ') {
        await updateState(userId, 'INPUT_WATER', {});
        return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: '💧 พิมพ์ปริมาณน้ำที่คุณดื่มลงไปได้เลยครับ (เป็นตัวเลข มิลลิลิตร เช่น 330)' }] });
      }

      if (userMessage.startsWith('บันทึกน้ำ') || userMessage.startsWith('น้ำ ')) {
        const valStr = userMessage.replace('บันทึกน้ำ', '').replace('น้ำ', '').trim();
        const addedWater = parseInt(valStr) || 250;
        let { data: mLog } = await supabase.from('daily_missions').select('water_accum_ml').eq('user_id', userId).eq('log_date', todayStr).single();
        const newWater = (mLog?.water_accum_ml || 0) + addedWater;

        await supabase.from('daily_missions').upsert({ user_id: userId, log_date: todayStr, water_accum_ml: newWater }, { onConflict: 'user_id,log_date' });

        const updatedCard = await buildMissionCard(userId, profile);
        return client.replyMessage({
          replyToken: event.replyToken,
          messages: [
            { type: 'text', text: `💧 บันทึกน้ำดื่ม +${addedWater} ml เรียบร้อยครับ! (ยอดรวม: ${newWater} ml ✨)` },
            updatedCard
          ]
        });
      }

      if (userMessage.startsWith('บันทึกยืดตัว') || userMessage.startsWith('ยืด ')) {
        const valStr = userMessage.replace('บันทึกยืดตัว', '').replace('ยืด', '').trim();
        const addedStretch = parseInt(valStr) || 1;
        let { data: mLog } = await supabase.from('daily_missions').select('stretch_count').eq('user_id', userId).eq('log_date', todayStr).single();
        const newStretch = (addedStretch > 1) ? addedStretch : (mLog?.stretch_count || 0) + addedStretch;

        await supabase.from('daily_missions').upsert({ user_id: userId, log_date: todayStr, stretch_count: newStretch }, { onConflict: 'user_id,log_date' });

        const updatedCard = await buildMissionCard(userId, profile);
        return client.replyMessage({
          replyToken: event.replyToken,
          messages: [
            { type: 'text', text: `🧘‍♂️ บันทึกการยืดตัวเป็น ${newStretch} ครั้ง เรียบร้อยครับ! 👍` },
            updatedCard
          ]
        });
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
      currentContext.height = newH;

      await updateState(userId, 'UPDATE_DISEASE_ASK', currentContext);
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{
          type: 'text',
          text: '🩺 มีการเปลี่ยนแปลง หรืออัปเดตโรคประจำตัวเพิ่มเติมไหมครับ?',
          quickReply: {
            items: [
              { type: 'action', action: { type: 'message', label: 'คงเดิม (ไม่เปลี่ยน)', text: 'คงเดิม' } },
              { type: 'action', action: { type: 'message', label: 'แก้ไขโรคประจำตัว', text: 'แก้ไข' } }
            ]
          }
        }]
      });

    case 'UPDATE_DISEASE_ASK':
      if (userMessage === 'แก้ไข') {
        await updateState(userId, 'UPDATE_DISEASE_SELECT', currentContext);
        return sendDiseaseCard(event);
      } else {
        await saveUserProfile(
          userId, profile?.gender || 'ชาย', profile?.age || 16, profile?.user_type || 'บุคคลทั่วไป',
          profile?.chronic_disease || 'ไม่มี', profile?.dietary_restriction || 'ไม่มี',
          profile?.lifestyle || 'นั่งทำงานทั่วไป', currentContext.weight, currentContext.height
        );
        await updateState(userId, 'MAIN_MENU', {});
        return client.replyMessage({
          replyToken: event.replyToken,
          messages: [{ type: 'text', text: `🎉 อัปเดตสัดส่วนเรียบร้อยครับ!\n• น้ำหนัก: ${currentContext.weight} kg\n• ส่วนสูง: ${currentContext.height} cm\n\nระบบปรับคำนวณเป้าหมาย BMI, BMR และ TDEE ให้ใหม่แล้วครับ ✨` }]
        });
      }

    case 'UPDATE_DISEASE_SELECT':
      await saveUserProfile(
        userId, profile?.gender || 'ชาย', profile?.age || 16, profile?.user_type || 'บุคคลทั่วไป',
        userMessage, profile?.dietary_restriction || 'ไม่มี',
        profile?.lifestyle || 'นั่งทำงานทั่วไป', currentContext.weight, currentContext.height
      );
      await updateState(userId, 'MAIN_MENU', {});
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: `🎉 อัปเดตข้อมูลและโรคประจำตัว (${userMessage}) เรียบร้อยครับ! ✨` }]
      });

    case 'INPUT_WATER':
      const inputWater = parseInt(userMessage);
      if (isNaN(inputWater) || inputWater <= 0) return replyErr(event, 'โปรดพิมพ์ตัวเลขปริมาณน้ำเป็น มิลลิลิตร ครับ');
      
      const tDateWater = new Date().toISOString().split('T')[0];
      let { data: wLog } = await supabase.from('daily_missions').select('water_accum_ml').eq('user_id', userId).eq('log_date', tDateWater).single();
      const updatedWater = (wLog?.water_accum_ml || 0) + inputWater;

      await supabase.from('daily_missions').upsert({ user_id: userId, log_date: tDateWater, water_accum_ml: updatedWater }, { onConflict: 'user_id,log_date' });
      await updateState(userId, 'MISSION_ACTION', {});
      const updatedCardW = await buildMissionCard(userId, profile);
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: `💧 เพิ่มน้ำดื่มไป +${inputWater} ml เรียบร้อยครับ! (ยอดรวม: ${updatedWater} ml)` }, updatedCardW]
      });

    case 'INPUT_STEPS':
      const steps = parseInt(userMessage);
      if (isNaN(steps) || steps < 0) return replyErr(event, 'โปรดพิมพ์ระบุจำนวนก้าวเป็นตัวเลขครับ');
      
      const tDateSteps = new Date().toISOString().split('T')[0];
      await supabase.from('daily_missions').upsert({ user_id: userId, log_date: tDateSteps, step_count: steps }, { onConflict: 'user_id,log_date' });
      await updateState(userId, 'MISSION_ACTION', {});
      const updatedCardS = await buildMissionCard(userId, profile);
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: `👟 บันทึกก้าวเดินวันนี้: ${steps} ก้าว เรียบร้อยครับ! ✨` }, updatedCardS]
      });

    case 'MONTHLY_MENTAL':
      const validMentalScores = ['0', '1', '2', '3'];
      if (!validMentalScores.includes(userMessage)) return replyErr(event, 'เลือกกดจากปุ่มได้เลยครับ');

      const qIdx = currentContext.current_q;
      currentContext.scores[qIdx] = parseInt(userMessage);
      const nextIdx = qIdx + 1;

      if (nextIdx <= MENTAL_QUESTIONS.length) {
        currentContext.current_q = nextIdx;
        await updateState(userId, 'MONTHLY_MENTAL', currentContext);
        return sendMentalQuestion(event, nextIdx, '');
      } else {
        let totalScore = 0;
        MENTAL_QUESTIONS.forEach(q => {
          const rawScore = currentContext.scores[q.id] || 0;
          if (q.reverse) {
            totalScore += (3 - rawScore);
          } else {
            totalScore += rawScore;
          }
        });

        let mentalResult = "";
        if (totalScore >= 135) {
          mentalResult = "💚 สุขภาพจิตดีกว่าคนทั่วไป (เยี่ยมมากครับ! มีความสุขและจัดการอารมณ์ได้ดีเยี่ยม)";
        } else if (totalScore >= 110) {
          mentalResult = "🟡 สุขภาพจิตอยู่ในเกณฑ์ปานกลาง (เท่ากับคนทั่วไป สามารถรับมือกับเรื่องต่างๆ ได้ดี)";
        } else {
          mentalResult = "🔴 สุขภาพจิตต่ำกว่าเกณฑ์เฉลี่ยคนทั่วไป (กำลังเผชิญความเครียด แนะนำหาเวลาผ่อนคลาย หรือโทรปรึกษาสายด่วนสุขภาพจิต 1323 ได้ฟรีครับ)";
        }

        await supabase.from('mental_health_scores').upsert({
          user_id: userId,
          total_score: totalScore,
          result_text: mentalResult,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

        await updateState(userId, 'MAIN_MENU', {});

        const mentalResultCard = {
          type: "flex", altText: "🧠 รายงานผลการประเมินสุขภาพจิต",
          contents: {
            type: "bubble",
            header: {
              type: "box", layout: "vertical", backgroundColor: COLORS.PRIMARY,
              contents: [
                { type: "text", text: "🧠 ผลประเมินสุขภาพจิต (TMHI-55)", weight: "bold", size: "md", color: COLORS.WHITE },
                { type: "text", text: "อัปเดตผลประเมินล่าสุดเรียบร้อยครับ", size: "xs", color: "#CCFBF1", margin: "xs" }
              ]
            },
            body: {
              type: "box", layout: "vertical",
              contents: [
                { type: "text", text: `คะแนนสะสมรวม: ${totalScore} / 165 คะแนน`, size: "sm", color: COLORS.NEUTRAL_DARK, weight: "bold" },
                { type: "separator", margin: "md" },
                { type: "text", text: "📊 สรุปผลการประเมิน:", size: "xs", color: "#6B7280", margin: "md" },
                { type: "text", text: mentalResult, size: "sm", color: COLORS.PRIMARY, weight: "bold", wrap: true, margin: "xs" }
              ]
            }
          }
        };

        return client.replyMessage({
          replyToken: event.replyToken,
          messages: [mentalResultCard, { type: 'text', text: mainMenuText }]
        });
      }

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
      currentContext.user_type = userMessage;
      await updateState(userId, 'REG_DISEASE', currentContext);
      return sendDiseaseCard(event);

    case 'REG_DISEASE':
      currentContext.chronic_disease = userMessage;
      await updateState(userId, 'REG_DIET', currentContext);
      return sendDietCard(event);

    case 'REG_DIET':
      currentContext.dietary_restriction = userMessage;
      await updateState(userId, 'REG_LIFESTYLE', currentContext);
      return sendLifestyleCard(event);

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

      await updateState(userId, 'MISSION_ACTION', {});
      const updatedCardM = await buildMissionCard(userId, profile);
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: `รับทราบครับ! บันทึกความรู้สึกเรียบร้อยครับ ✨` }, updatedCardM] });
  }

  if (currentState === 'MAIN_MENU') {
    return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: mainMenuText }] });
  }
}

async function buildMissionCard(userId, profile) {
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

  return {
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
          { type: "text", text: `💧 ดื่มน้ำ: ${missionLog.water_accum_ml} / ${targetWater} ml (${waterPct}%)`, size: "xs", color: COLORS.ACCENT, weight: "bold" },
          {
            type: "box", layout: "horizontal", margin: "xs",
            contents: [
              { type: "button", style: "secondary", height: "sm", action: { type: "message", label: "+250", text: "บันทึกน้ำ 250" } },
              { type: "button", style: "secondary", height: "sm", margin: "xs", action: { type: "message", label: "+500", text: "บันทึกน้ำ 500" } },
              { type: "button", style: "secondary", height: "sm", margin: "xs", action: { type: "message", label: "ระบุ", text: "ระบุปริมาณน้ำ" } }
            ]
          },
          { type: "text", text: `🧘‍♂️ ยืดตัว: ${missionLog.stretch_count} / 3-5 ครั้ง`, size: "xs", color: COLORS.SECONDARY, margin: "md", weight: "bold" },
          {
            type: "box", layout: "horizontal", margin: "xs",
            contents: [
              { type: "button", style: "primary", color: COLORS.SECONDARY, height: "sm", action: { type: "message", label: "+1 ครั้ง", text: "บันทึกยืดตัว 1" } },
              { type: "button", style: "primary", color: COLORS.SECONDARY, height: "sm", margin: "xs", action: { type: "message", label: "3 ครั้ง", text: "บันทึกยืดตัว 3" } },
              { type: "button", style: "primary", color: COLORS.SECONDARY, height: "sm", margin: "xs", action: { type: "message", label: "5 ครั้ง", text: "บันทึกยืดตัว 5" } }
            ]
          },
          { type: "text", text: `🚶‍♂️ เดินสะสม: ${missionLog.step_count} / ${targetSteps} ก้าว (${stepPct}%)`, size: "xs", color: COLORS.WARNING, margin: "md", weight: "bold" },
          { type: "button", style: "primary", color: COLORS.WARNING, height: "sm", margin: "xs", action: { type: "message", label: "👟 บันทึกจำนวนก้าวเดิน", text: "บันทึกก้าวเดิน" } },
          { type: "separator", margin: "md" },
          { type: "button", style: "link", height: "sm", margin: "xs", action: { type: "message", label: "🌤️ บันทึกอารมณ์/ความรู้สึกวันนี้", text: "เช็กอินอารมณ์" } }
        ]
      }
    }
  };
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

function sendDietCard(event) {
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
          { type: "button", style: "primary", color: "#B45309", margin: "sm", action: { type: "message", label: "🥚 แพ้ไข่", text: "แพ้ไข่" } },
          { type: "button", style: "primary", color: "#7C3AED", margin: "sm", action: { type: "message", label: "🥜 แพ้ถั่วชนิดต่างๆ", text: "แพ้ถั่ว" } }
        ]
      }
    }
  };
  return client.replyMessage({ replyToken: event.replyToken, messages: [dietCard] });
}

function sendLifestyleCard(event) {
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
          { type: "button", style: "primary", color: "#0284C7", margin: "sm", action: { type: "message", label: "🏃 เคลื่อนไหวบ่อย/ออกกำลัง", text: "ทำงานหนักใช้แรง" } }
        ]
      }
    }
  };
  return client.replyMessage({ replyToken: event.replyToken, messages: [lifestyleCard] });
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
  console.log('Server running!');
});