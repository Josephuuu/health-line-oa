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

// รายการคำถามสุขภาพจิต (5 ข้อสำหรับทดสอบระบบ)
const MENTAL_QUESTIONS = [
  { id: 1, text: "1. ท่านรู้สึกพึงพอใจในชีวิต" },
  { id: 2, text: "2. ท่านรู้สึกสบายใจ" },
  { id: 3, text: "3. ท่านรู้สึกสดชื่นเบิกบานใจ" },
  { id: 4, text: "4. ท่านรู้สึกชีวิตของท่านมีความสุขสงบ" },
  { id: 5, text: "5. ท่านรู้สึกเบื่อหน่ายท้อแท้กับการดำเนินชีวิตประจำวัน" }
];

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

  const userId = event.source.userId;
  const userMessage = event.message.text.trim();

  // 1. ดึงสถานะปัจจุบันของ User
  let { data: stateData } = await supabase.from('user_states').select('state, context').eq('user_id', userId).single();
  let currentState = stateData ? stateData.state : 'MAIN_MENU';
  let currentContext = stateData && stateData.context ? stateData.context : {};

  if (!stateData) {
    await supabase.from('user_states').insert({ user_id: userId, state: 'MAIN_MENU', context: { welcome_seen: false } });
    currentContext = { welcome_seen: false };
  }

  // ข้อความเมนูหลักแบบมาตรฐาน (4 ฟีเจอร์)
  const mainMenuText = '🤖 กรุณาเลือกฟีเจอร์จากเมนูด้านล่าง หรือพิมพ์เลือกเมนูที่ต้องการได้เลยครับ:\n\n' +
                       '1. ทำแบบทดสอบสุขภาพจิต\n' +
                       '2. ภารกิจสุขภาพประจำวัน\n' +
                       '3. อาหารโรงอาหาร\n' +
                       '4. แนะนำอาหารลดน้ำหนัก';

  // 2. [GLOBAL COMMANDS] ระบบคำสั่งลัดและนำทางเบื้องต้น
  if (userMessage === 'กลับหน้าหลัก' || userMessage === 'เมนูหลัก') {
    const hasSeenWelcome = currentContext.welcome_seen === true;
    await supabase.from('user_states').upsert({ 
      user_id: userId, 
      state: 'MAIN_MENU', 
      context: { welcome_seen: true } 
    }, { onConflict: 'user_id' });

    let replyText = !hasSeenWelcome 
      ? 'ยินดีต้อนรับสู่ระบบดูแลสุขภาพครับ!\n' + mainMenuText
      : 'กลับสู่หน้าหลักแล้วครับ\n' + mainMenuText;

    return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: replyText }] });
  }

  if (userMessage === 'สุขภาพจิต' || userMessage === 'เริ่มทำแบบทดสอบสุขภาพจิต' || userMessage === '1') {
    let { data: profile } = await supabase.from('user_profiles').select('*').eq('user_id', userId).single();
    if (!profile) {
      await supabase.from('user_states').upsert({ user_id: userId, state: 'ASK_GENDER', context: { welcome_seen: true } }, { onConflict: 'user_id' });
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: 'ยินดีต้อนรับครับ! ก่อนเริ่มต้นทำแบบทดสอบสุขภาพจิต ขอข้อมูลส่วนตัวเพื่อนำไปประมวลผลระบบภารกิจสุขภาพควบคู่ไปด้วยกันนะครับ\n\nโปรดพิมพ์เพศของคุณ (ชาย หรือ หญิง)' }],
      });
    }

    const initialContext = { current_q: 1, scores: {}, welcome_seen: true };
    await supabase.from('user_states').upsert({ user_id: userId, state: 'MENTAL_HEALTH_TEST', context: initialContext }, { onConflict: 'user_id' });
    return sendMentalQuestion(event, 1);
  }

  if (userMessage === 'ภารกิจสุขภาพประจำวัน' || userMessage === '2') {
    let { data: profile } = await supabase.from('user_profiles').select('*').eq('user_id', userId).single();
    if (!profile) {
      await supabase.from('user_states').upsert({ user_id: userId, state: 'ASK_GENDER', context: { welcome_seen: true } }, { onConflict: 'user_id' });
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: 'ยินดีต้อนรับครับ! มาร่วมดูแลสุขภาพและจิตใจไปด้วยกันนะ ก่อนอื่นขอข้อมูลเพื่อประมวลผลสุขภาพก่อนครับ\n\nโปรดพิมพ์เพศของคุณ (ชาย หรือ หญิง)' }],
      });
    }

    let { data: checkScore } = await supabase.from('mental_health_scores').select('*').eq('user_id', userId).limit(1);
    if (!checkScore || checkScore.length === 0) {
      const initialContext = { current_q: 1, scores: {}, welcome_seen: true };
      await supabase.from('user_states').upsert({ user_id: userId, state: 'MENTAL_HEALTH_TEST', context: initialContext }, { onConflict: 'user_id' });
      
      const firstQuestion = MENTAL_QUESTIONS.find(q => q.id === 1);
      let lockText = `🔒 คุณยังไม่ได้ทำแบบทดสอบสุขภาพจิตเริ่มต้นประจำตัวเลยครับ ขอความกรุณาทำแบบทดสอบ 55 ข้อนี้ให้เสร็จก่อน เพื่อเปิดใช้งานระบบภารกิจประจำวันนะครับ\n\n` +
        `🧠 [แบบทดสอบสุขภาพจิต]\n\n${firstQuestion.text}\n\nโปรดเลือกคำตอบที่ตรงกับความรู้สึกของคุณมากที่สุด:`;
        
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{
          type: 'text',
          text: lockText,
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
    
    await supabase.from('user_states').upsert({ user_id: userId, state: 'DAILY_MISSION', context: { welcome_seen: true } }, { onConflict: 'user_id' });
    return showDailyDashboard(event, userId, profile);
  }

  // ฟีเจอร์ที่ 3: อาหารโรงอาหาร
  if (userMessage === 'อาหารโรงอาหาร' || userMessage === '3') {
    let canteenText = `🏪 [เมนูอาหารโรงอาหารวันนี้]\n` +
                      `----------------------------------\n` +
                      `🍗 ร้านที่ 1 (ข้าวราดแกง): \n• แกงส้มชะอมกุ้ง + ไข่เจียว (45.-)\n• ผัดกะเพราไก่ + ไข่ดาว (40.-)\n\n` +
                      `🍜 ร้านที่ 2 (ก๋วยเตี๋ยว): \n• เส้นเล็กต้มยำหมูสับ (40.-)\n• บะหมี่เย็นตาโฟ (45.-)\n\n` +
                      `🍉 ร้านที่ 3 (ผลไม้/เครื่องดื่ม): \n• แตงโม/สับปะรด ชิ้นละ (20.-)\n• น้ำเปล่าเย็น ๆ (10.-)\n\n` +
                      `💡 พิมพ์ "เมนูหลัก" เพื่อกลับหน้าเดิมได้ครับ`;
    return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: canteenText }] });
  }

  // ฟีเจอร์ที่ 4: แนะนำอาหารลดน้ำหนัก (ดึงค่า BMR มาคำนวณอัตโนมัติ)
  if (userMessage === 'แนะนำอาหารลดน้ำหนัก' || userMessage === '4') {
    let { data: profile } = await supabase.from('user_profiles').select('*').eq('user_id', userId).single();
    
    if (!profile) {
      await supabase.from('user_states').upsert({ user_id: userId, state: 'ASK_GENDER', context: { welcome_seen: true } }, { onConflict: 'user_id' });
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: '🔒 ฟีเจอร์นี้ต้องใช้ค่าทางกายภาพของคุณครับ กรุณากรอกข้อมูลส่วนตัวก่อนนะครับ\n\nโปรดพิมพ์เพศของคุณ (ชาย หรือ หญิง)' }],
      });
    }

    // คำนวณแคลอรีที่ควรทานต่อมื้อสำหรับการลดน้ำหนัก (TDEE หักออก 500 kcal แล้วหาร 3 มื้อ)
    const tdee = profile.tdee || 2000;
    const targetCaloriesPerMeal = Math.round((tdee - 500) / 3);

    let dietText = `🥗 [เมนูแนะนำเพื่อลดน้ำหนักของคุณ]\n` +
                   `📊 จากค่าพลังงาน (TDEE) ของคุณ เพื่อลดน้ำหนักอย่างปลอดภัย คุณควรทานอาหารมื้อนี้ไม่เกิน **${targetCaloriesPerMeal} kcal** ครับ\n` +
                   `----------------------------------\n\n` +
                   `💡 เมนูแนะนำที่แคลอรีผ่านเกณฑ์:\n` +
                   `1️⃣ ข้าวกล้อง + อกไก่ผัดขิง (~350 kcal)\n` +
                   `2️⃣ ต้มจืดเต้าหู้หมูสับวุ้นเส้น (~200 kcal)\n` +
                   `3️⃣ แกงส้มกุ้งผักรวม (ไม่ใส่ชะอมทอด) (~120 kcal)\n` +
                   `4️⃣ ส้มตำไทย (หวานน้อย) + ไก่ย่างไม่ติดหนัง (~250 kcal)\n\n` +
                   `❌ ควรหลีกเลี่ยง: ของทอด ของมัน และน้ำหวานแก้วโปรดในช่วงนี้นะครับ สู้ ๆ !`;

    return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: dietText }] });
  }

  // 3. STATE ROUTING (ระบบ Onboarding กรอกข้อมูล)
  switch (currentState) {
    case 'ASK_GENDER': {
      if (userMessage !== 'ชาย' && userMessage !== 'หญิง') {
        return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'กรุณาพิมพ์ระบุให้ถูกต้องว่า "ชาย" หรือ "หญิง" ครับ' }] });
      }
      currentContext.gender = userMessage;
      await supabase.from('user_states').update({ state: 'ASK_AGE', context: currentContext }).eq('user_id', userId);
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'กรุณาพิมพ์ อายุ ของคุณเป็นตัวเลข (ปี) เช่น 15' }] });
    }

    case 'ASK_AGE': {
      const age = parseInt(userMessage);
      if (isNaN(age) || age < 1 || age > 100) {
        return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'กรุณาพิมพ์อายุเป็นตัวเลขที่ถูกต้องครับ' }] });
      }
      currentContext.age = age;
      await supabase.from('user_states').update({ state: 'ASK_WEIGHT', context: currentContext }).eq('user_id', userId);
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'กรุณาพิมพ์ น้ำหนัก ของคุณเป็นตัวเลข (กิโลกรัม)' }] });
    }

    case 'ASK_WEIGHT': {
      const weight = parseFloat(userMessage);
      if (isNaN(weight) || weight <= 0) {
        return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'กรุณาพิมพ์น้ำหนักเป็นตัวเลขที่ถูกต้องครับ' }] });
      }
      currentContext.weight = weight;
      await supabase.from('user_states').update({ state: 'ASK_HEIGHT', context: currentContext }).eq('user_id', userId);
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'กรุณาพิมพ์ ส่วนสูง ของคุณเป็นตัวเลข (เซนติเมตร)' }] });
    }

    case 'ASK_HEIGHT': {
      const height = parseFloat(userMessage);
      if (isNaN(height) || height <= 0) {
        return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'กรุณาพิมพ์ส่วนสูงเป็นตัวเลขที่ถูกต้องครับ' }] });
      }
      
      const gender = currentContext.gender;
      const age = currentContext.age;
      const weight = currentContext.weight;
      const heightMeter = height / 100;
      const bmi = parseFloat((weight / (heightMeter * heightMeter)).toFixed(1));

      let bmr = (gender === 'ชาย') ? (10 * weight + 6.25 * height - 5 * age + 5) : (10 * weight + 6.25 * height - 5 * age - 161);
      bmr = Math.round(bmr);
      const tdee = Math.round(bmr * 1.375);
      const water_goal = Math.round(weight * 33);
      let step_goal = (bmi < 18.5) ? 8000 : (bmi < 23) ? 10000 : (bmi < 25) ? 11000 : 7000;

      await supabase.from('user_profiles').upsert({
        user_id: userId, gender, age, weight, height, bmi, bmr, tdee, water_goal, step_goal
      }, { onConflict: 'user_id' });

      const firstQuestion = MENTAL_QUESTIONS.find(q => q.id === 1);

      let combinedText = `📝 บันทึกสัดส่วนร่างกายเรียบร้อยแล้วครับ!\n\n` +
        `📊 สรุปค่าทางกายภาพของคุณ:\n• BMI: ${bmi}\n• BMR: ${bmr} kcal/วัน\n• เป้าหมายดื่มน้ำ: ${water_goal} ml/วัน\n\n` +
        `⚠️ ลำดับถัดไประบบจะพาคุณเข้าสู่ "แบบทดสอบสุขภาพจิตเริ่มต้น" ทันที เพื่อประเมินจิตใจและเปิดใช้งานภารกิจประจำวันครับ\n` +
        `----------------------------------------\n\n` +
        `🧠 [แบบทดสอบสุขภาพจิต]\n\n${firstQuestion.text}\n\nโปรดเลือกคำตอบที่ตรงกับความรู้สึกของคุณมากที่สุดในช่วง 2 สัปดาห์ที่ผ่านมา:`;
      
      const initialMentalContext = { current_q: 1, scores: {}, welcome_seen: true };
      await supabase.from('user_states').upsert({ 
        user_id: userId, 
        state: 'MENTAL_HEALTH_TEST', 
        context: initialMentalContext 
      }, { onConflict: 'user_id' });

      return client.replyMessage({ 
        replyToken: event.replyToken, 
        messages: [{
          type: 'text',
          text: combinedText,
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

    case 'MENTAL_HEALTH_TEST': {
      const validScores = ['0', '1', '2', '3'];
      if (!validScores.includes(userMessage)) {
        return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: '⚠️ โปรดเลือกคำตอบจากปุ่มด่วนด้านล่างเท่านั้นครับ' }] });
      }

      const currentQ = currentContext.current_q;
      currentContext.scores[currentQ] = parseInt(userMessage);

      const nextQ = currentQ + 1;
      if (nextQ <= MENTAL_QUESTIONS.length) {
        currentContext.current_q = nextQ;
        await supabase.from('user_states').update({ context: currentContext }).eq('user_id', userId);
        return sendMentalQuestion(event, nextQ);
      } else {
        let totalScore = 0;
        for (const qId in currentContext.scores) {
          totalScore += currentContext.scores[qId];
        }

        let resultText = "";
        let adviceText = "";

        if (totalScore <= 5) { 
          resultText = "🚨 ตรวจพบภาวะมีความเสี่ยงด้านสุขภาพจิต";
          adviceText = "💡 [คำแนะนำวิธีแก้ไขสำหรับคุณ]:\nช่วงนี้คุณอาจจะเจอเรื่องเหนื่อยใจหรือเครียดสะสม แนะนำให้ลองหยุดพักผ่อน ฟังเพลงที่ชอบ หรือหาน้ำเย็น ๆ ดื่มนะ หากรู้สึกไม่ไหว สามารถใช้ฟีเจอร์พิมพ์คุยระบายกับบอทได้เสมอนะครับ";
        } else {
          resultText = "🟢 สภาพจิตใจปกติ ดีเยี่ยม";
          adviceText = "💡 [คำแนะนำสำหรับคุณ]:\nยอดเยี่ยมมากครับ! คุณมีเกราะป้องกันจิตใจที่ดีมาก รักษาสุขภาพใจที่สดใสแบบนี้ต่อไปเรื่อย ๆ นะครับ";
        }

        await supabase.from('mental_health_scores').insert({
          user_id: userId, total_score: totalScore, result_text: resultText
        });

        await supabase.from('user_states').upsert({ user_id: userId, state: 'DAILY_MISSION', context: { welcome_seen: true } }, { onConflict: 'user_id' });
        
        let { data: profile } = await supabase.from('user_profiles').select('*').eq('user_id', userId).single();
        const todayStr = new Date().toISOString().split('T')[0];
        let { data: progress } = await supabase.from('daily_progress').select('*').eq('user_id', userId).eq('log_date', todayStr).single();
        
        if (!progress) {
          const { data: newProg } = await supabase.from('daily_progress').insert({ user_id: userId, log_date: todayStr }).select().single();
          progress = newProg;
        }

        const water_goal = profile ? profile.water_goal : 2000;
        const step_goal = profile ? profile.step_goal : 10000;
        const currentWater = progress ? progress.water_intake : 0;
        const currentSteps = progress ? progress.steps_count : 0;
        const currentStretch = progress ? progress.stretch_count : 0;

        const waterPercent = Math.min((currentWater / water_goal) * 100, 100);
        const stepPercent = Math.min((currentSteps / step_goal) * 100, 100);
        const stretchPercent = Math.min((currentStretch / 3) * 100, 100);
        const totalSuccess = Math.round((waterPercent + stepPercent + stretchPercent) / 3);

        let finishCombinedText = `🎉 ทำแบบทดสอบสุขภาพจิตเสร็จสิ้นแล้ว!\n\n📊 คะแนนรวมของคุณ: ${totalScore} คะแนน\n🔍 ผลประเมิน: ${resultText}\n\n${adviceText}\n` +
          `----------------------------------------\n` +
          `🏁 ระบบได้คำนวณสัดส่วนสถิติคุณเรียบร้อยแล้ว! นี่คือแดชบอร์ดภารกิจประจำวันเฉพาะคุณ มาร่วมทำภารกิจกันเถอะครับ 👇\n\n` +
          `🏃‍♂️ [แดชบอร์ดภารกิจประจำวัน]\n` +
          `🔥 ความสำเร็จรวม: ${totalSuccess}%\n\n` +
          `💧 1. การดื่มน้ำ: ${currentWater} / ${water_goal} ml\n` +
          `👟 2. การเดินนับก้าว: ${currentSteps} / ${step_goal} ก้าว\n` +
          `🧘‍♂️ 3. ยืดเส้นยืดสาย: ${currentStretch} / 3 ครั้ง\n\n` +
          `👉 กดปุ่มด่วนด้านล่างเพื่อบันทึกภารกิจแรกของคุณได้เลยครับ!`;

        return client.replyMessage({
          replyToken: event.replyToken,
          messages: [{
            type: 'text',
            text: finishCombinedText,
            quickReply: {
              items: [
                { type: 'action', action: { type: 'message', label: '💧 ดื่มน้ำ 300ml', text: 'ดื่มน้ำ 300ml' } },
                { type: 'action', action: { type: 'message', label: '🧘‍♂️ ยืดเส้นแล้ว', text: 'ยืดเส้นแล้ว' } },
                { type: 'action', action: { type: 'message', label: '👟 เดิน +1,000 ก้าว', text: 'เดิน 1000' } },
                { type: 'action', action: { type: 'message', label: '🏠 เมนูหลัก', text: 'กลับหน้าหลัก' } }
              ]
            }
          }]
        });
      }
    }

    case 'DAILY_MISSION': {
      const todayStr = new Date().toISOString().split('T')[0];
      let { data: progress } = await supabase.from('daily_progress').select('*').eq('user_id', userId).eq('log_date', todayStr).single();
      if (!progress) {
        const { data: newProg } = await supabase.from('daily_progress').insert({ user_id: userId, log_date: todayStr }).select().single();
        progress = newProg;
      }
      if (userMessage === 'ดื่มน้ำ 300ml') {
        await supabase.from('daily_progress').update({ water_intake: progress.water_intake + 300 }).eq('id', progress.id);
        return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: '💧 บันทึกการดื่มน้ำ +300 มล. สำเร็จ!' }] });
      }
      if (userMessage === 'ยืดเส้นแล้ว') {
        await supabase.from('daily_progress').update({ stretch_count: progress.stretch_count + 1 }).eq('id', progress.id);
        return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: '🏃‍♂️ บันทึกการยืดเส้นยืดสาย +1 ครั้ง สำเร็จ!' }] });
      }
      if (userMessage.startsWith('เดิน ')) {
        const steps = parseInt(userMessage.replace('เดิน ', ''));
        if (!isNaN(steps)) {
          await supabase.from('daily_progress').update({ steps_count: progress.steps_count + steps }).eq('id', progress.id);
          return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: `👟 บันทึกจำนวนก้าว +${steps} ก้าว สำเร็จ!` }] });
        }
      }
      let { data: profile } = await supabase.from('user_profiles').select('*').eq('user_id', userId).single();
      return showDailyDashboard(event, userId, profile);
    }
  }

  // Fallback หน้าหลัก
  if (currentState === 'MAIN_MENU') {
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: 'กลับสู่หน้าหลักแล้วครับ\n' + mainMenuText }]
    });
  }
}

function sendMentalQuestion(event, qId) {
  const question = MENTAL_QUESTIONS.find(q => q.id === qId);
  return client.replyMessage({
    replyToken: event.replyToken,
    messages: [{
      type: 'text',
      text: `🧠 [แบบทดสอบสุขภาพจิต]\n\n${question.text}\n\nโปรดเลือกคำตอบที่ตรงกับความรู้สึกของคุณมากที่สุดในช่วง 2 สัปดาห์ที่ผ่านมา:`,
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

async function showDailyDashboard(event, userId, profile) {
  const todayStr = new Date().toISOString().split('T')[0];
  let { data: progress } = await supabase.from('daily_progress').select('*').eq('user_id', userId).eq('log_date', todayStr).single();
  
  if (!progress) {
    const { data: newProg } = await supabase.from('daily_progress').insert({ user_id: userId, log_date: todayStr }).select().single();
    progress = newProg;
  }

  const water_goal = profile ? profile.water_goal : 2000;
  const step_goal = profile ? profile.step_goal : 10000;
  const currentWater = progress ? progress.water_intake : 0;
  const currentSteps = progress ? progress.steps_count : 0;
  const currentStretch = progress ? progress.stretch_count : 0;

  const waterPercent = Math.min((currentWater / water_goal) * 100, 100);
  const stepPercent = Math.min((currentSteps / step_goal) * 100, 100);
  const stretchPercent = Math.min((currentStretch / 3) * 100, 100);
  const totalSuccess = Math.round((waterPercent + stepPercent + stretchPercent) / 3);

  const dashboardText = `🏃‍♂️ [แดชบอร์ดภารกิจประจำวัน]\n🔥 ความสำเร็จรวม: ${totalSuccess}%\n\n💧 1. การดื่มน้ำ:\n   - ทำได้: ${currentWater} / ${water_goal} ml\n\n👟 2. การเดินนับก้าว:\n   - ทำได้: ${currentSteps} / ${step_goal} ก้าว\n\n🧘‍♂️ 3. ยืดเส้นยืดสาย:\n   - ทำได้: ${currentStretch} / 3 ครั้ง`;

  return client.replyMessage({
    replyToken: event.replyToken,
    messages: [{
      type: 'text',
      text: dashboardText,
      quickReply: {
        items: [
          { type: 'action', action: { type: 'message', label: '💧 ดื่มน้ำ 300ml', text: 'ดื่มน้ำ 300ml' } },
          { type: 'action', action: { type: 'message', label: '🧘‍♂️ ยืดเส้นแล้ว', text: 'ยืดเส้นแล้ว' } },
          { type: 'action', action: { type: 'message', label: '👟 เดิน +1,000 ก้าว', text: 'เดิน 1000' } },
          { type: 'action', action: { type: 'message', label: '🏠 เมนูหลัก', text: 'กลับหน้าหลัก' } }
        ]
      }
    }]
  });
}

app.listen(process.env.PORT || 3000, () => {
  console.log(`Server running on port ${process.env.PORT || 3000}`);
});