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

  // 1. ดึงสถานะปัจจุบัน
  let { data: stateData } = await supabase.from('user_states').select('state, context').eq('user_id', userId).single();
  let currentState = stateData ? stateData.state : 'MAIN_MENU';
  let currentContext = stateData && stateData.context ? stateData.context : {};

  if (!stateData) {
    await supabase.from('user_states').insert({ user_id: userId, state: 'MAIN_MENU', context: {} });
  }

  // 2. [GLOBAL COMMANDS]
  if (userMessage === 'สุขภาพจิต') {
    await supabase.from('user_states').upsert({ user_id: userId, state: 'MENTAL_HEALTH_TEST', context: {} }, { onConflict: 'user_id' });
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: 'ยินดีต้อนรับสู่ระบบประเมินสุขภาพจิตครับ วันนี้คุณรู้สึกอย่างไรบ้าง? (ระบบกำลังพัฒนารูปแบบคำถาม 55 ข้อ)' }],
    });
  }

  if (userMessage === 'อาหารโรงอาหาร') {
    await supabase.from('user_states').upsert({ user_id: userId, state: 'AWAITING_FOOD_NAME', context: {} }, { onConflict: 'user_id' });
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: 'โปรดพิมพ์ชื่อเมนูอาหารในโรงอาหารที่ต้องการทราบคุณค่าโภชนาการได้เลยครับ' }],
    });
  }

  if (userMessage === 'แนะนำอาหารลดน้ำหนัก') {
    // ดึง Profile มาเช็คก่อนว่าคำนวณ BMI หรือยัง
    let { data: profile } = await supabase.from('user_profiles').select('bmi').eq('user_id', userId).single();
    if (!profile) {
      await supabase.from('user_states').upsert({ user_id: userId, state: 'ASK_GENDER', context: { redirect_to: 'WEIGHT_LOSS_CONSULT' } }, { onConflict: 'user_id' });
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: 'ก่อนแนะนำอาหารลดน้ำหนัก ขออนุญาตลงทะเบียนข้อมูลสุขภาพก่อนนะครับ\n\nโปรดพิมพ์เพศของคุณครับ (พิมพ์: ชาย หรือ หญิง)' }],
      });
    }

    await supabase.from('user_states').upsert({ user_id: userId, state: 'WEIGHT_LOSS_CONSULT', context: {} }, { onConflict: 'user_id' });
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: 'คุณอยากให้แนะนำอาหารลดน้ำหนักแนวไหน พิมพ์บอกความต้องการ หรือพิมพ์ประเภท (มังสวิรัติ, แพ้นม, แพ้ไข่) มาได้เลยครับ' }],
    });
  }

  if (userMessage === 'ภารกิจสุขภาพประจำวัน') {
    // เช็คว่ามี Profile หรือยัง
    let { data: profile } = await supabase.from('user_profiles').select('*').eq('user_id', userId).single();
    if (!profile) {
      await supabase.from('user_states').upsert({ user_id: userId, state: 'ASK_GENDER', context: { redirect_to: 'DAILY_MISSION' } }, { onConflict: 'user_id' });
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: 'ยินดีต้อนรับสู่ระบบภารกิจสุขภาพประจำวันของวัยรุ่นมัธยม! ก่อนเริ่มภารกิจ ขอข้อมูลเพื่อคำนวณเป้าหมายก่อนนะครับ\n\nโปรดพิมพ์เพศของคุณครับ (พิมพ์: ชาย หรือ หญิง)' }],
      });
    }

    // ถ้ามี Profile แล้ว ให้ไปหน้าโชว์ความสำเร็จและรับข้อมูลภารกิจประจำวัน
    await supabase.from('user_states').upsert({ user_id: userId, state: 'DAILY_MISSION', context: {} }, { onConflict: 'user_id' });
    return showDailyDashboard(event, userId, profile);
  }

  if (userMessage === 'กลับหน้าหลัก' || userMessage === 'เมนูหลัก') {
    await supabase.from('user_states').upsert({ user_id: userId, state: 'MAIN_MENU', context: {} }, { onConflict: 'user_id' });
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: 'กลับสู่หน้าหลักแล้วครับ เลือกฟีเจอร์ที่ต้องการใช้งานได้เลย' }],
    });
  }

  // 3. STATE ROUTING (ระเบียบการกรอกข้อมูลและใช้งานฟีเจอร์)
  switch (currentState) {
    case 'ASK_GENDER': {
      if (userMessage !== 'ชาย' && userMessage !== 'หญิง') {
        return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'กรุณาพิมพ์ระบุให้ถูกต้องว่า "ชาย" หรือ "หญิง" ครับ' }] });
      }
      currentContext.gender = userMessage;
      await supabase.from('user_states').update({ state: 'ASK_AGE', context: currentContext }).eq('user_id', userId);
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'กรุณาพิมพ์ อายุ ของคุณเป็นตัวเลข (ปี) ครับ เช่น 15' }] });
    }

    case 'ASK_AGE': {
      const age = parseInt(userMessage);
      if (isNaN(age) || age < 1 || age > 100) {
        return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'กรุณาพิมพ์อายุเป็นตัวเลขที่ถูกต้องครับ' }] });
      }
      currentContext.age = age;
      await supabase.from('user_states').update({ state: 'ASK_WEIGHT', context: currentContext }).eq('user_id', userId);
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'กรุณาพิมพ์ น้ำหนัก ของคุณเป็นตัวเลข (กิโลกรัม) ครับ เช่น 55.5' }] });
    }

    case 'ASK_WEIGHT': {
      const weight = parseFloat(userMessage);
      if (isNaN(weight) || weight <= 0) {
        return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'กรุณาพิมพ์น้ำหนักเป็นตัวเลขที่ถูกต้องครับ' }] });
      }
      currentContext.weight = weight;
      await supabase.from('user_states').update({ state: 'ASK_HEIGHT', context: currentContext }).eq('user_id', userId);
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'กรุณาพิมพ์ ส่วนสูง ของคุณเป็นตัวเลข (เซนติเมตร) ครับ เช่น 165' }] });
    }

    case 'ASK_HEIGHT': {
      const height = parseFloat(userMessage);
      if (isNaN(height) || height <= 0) {
        return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: 'กรุณาพิมพ์ส่วนสูงเป็นตัวเลขที่ถูกต้องครับ' }] });
      }
      
      // ดึงข้อมูลทั้งหมดที่บันทึกไว้ในสเตจก่อนหน้ามาคำนวณ
      const gender = currentContext.gender;
      const age = currentContext.age;
      const weight = currentContext.weight;
      
      // 1. คำนวณ BMI
      const heightMeter = height / 100;
      const bmi = parseFloat((weight / (heightMeter * heightMeter)).toFixed(1));

      // 2. คำนวณ BMR
      let bmr = 0;
      if (gender === 'ชาย') {
        bmr = 10 * weight + 6.25 * height - 5 * age + 5;
      } else {
        bmr = 10 * weight + 6.25 * height - 5 * age - 161;
      }
      bmr = Math.round(bmr);

      // 3. คำนวณ TDEE (สมมติระดับกิจกรรมปานกลางของนักเรียนคือ ออกกำลังกาย 1-3 วัน/สัปดาห์ = 1.375)
      const tdee = Math.round(bmr * 1.375);

      // 4. คำนวณปริมาณน้ำ (เฉลี่ย 33 มล. ต่อน้ำหนักตัว)
      const water_goal = Math.round(weight * 33);

      // 5. กำหนดเป้าหมายก้าวตามเกณฑ์ BMI
      let step_goal = 10000;
      if (bmi < 18.5) step_goal = 8000;
      else if (bmi >= 18.5 && bmi < 23) step_goal = 10000;
      else if (bmi >= 23 && bmi < 25) step_goal = 11000;
      else if (bmi >= 25) step_goal = 7000; // เริ่มต้นแบบค่อยเป็นค่อยไปสำหรับคนน้ำหนักตัวเยอะ

      // บันทึกลงตารางโปรไฟล์ผู้ใช้
      const { data: newProfile, error: profErr } = await supabase.from('user_profiles').upsert({
        user_id: userId, gender, age, weight, height, bmi, bmr, tdee, water_goal, step_goal
      }, { onConflict: 'user_id' }).select().single();

      if (profErr) console.error('Error saving profile:', profErr);

      // สลับโหมดไปยังเป้าหมายเดิมที่กดเข้ามา (เช่น แนะนำอาหาร หรือ ภารกิจประจำวัน)
      const redirect = currentContext.redirect_to || 'DAILY_MISSION';
      await supabase.from('user_states').upsert({ user_id: userId, state: redirect, context: {} }, { onConflict: 'user_id' });

      let introText = `บันทึกข้อมูลเรียบร้อยแล้วครับ!\n\n📊 ผลลัพธ์ของคุณ:\n• BMI: ${bmi} (${translateBmi(bmi)})\n• BMR: ${bmr} kcal/วัน\n• ดื่มน้ำที่ควรได้รับ: ${water_goal} ml/วัน\n• เป้าหมายก้าวเดิน: ${step_goal} ก้าว/วัน`;

      await client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: introText }] });
      
      // ถ้าเป้าหมายคือภารกิจ ให้แสดง Dashboard ต่อเลย
      if (redirect === 'DAILY_MISSION') {
        return showDailyDashboard(event, userId, newProfile);
      }
      return;
    }

    case 'DAILY_MISSION': {
      // ดักจับพิมพ์คีย์เวิร์ดเพิ่มแต้มภารกิจแบบโพลจำลอง (Input ประยุกต์จากที่คุณต้องการ)
      let { data: profile } = await supabase.from('user_profiles').select('*').eq('user_id', userId).single();
      
      // สร้างหรือดึงแถวความคืบหน้าของวันนี้
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
        return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: '🏃‍♂️ บันทึกการยืดเส้นยืดสาย +1 ครั้ง สำเร็จ! ทำต่อไปนะ' }] });
      }
      if (userMessage.startsWith('เดิน ')) {
        const steps = parseInt(userMessage.replace('เดิน ', ''));
        if (!isNaN(steps)) {
          await supabase.from('daily_progress').update({ steps_count: progress.steps_count + steps }).eq('id', progress.id);
          return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: `👟 บันทึกจำนวนก้าว +${steps} ก้าว สำเร็จ!` }] });
        }
      }

      // ถ้าพิมอย่างอื่นในโหมดนี้ ให้รีเฟรชโชว์ Dashboard
      return showDailyDashboard(event, userId, profile);
    }

    case 'WEIGHT_LOSS_CONSULT': {
      // ฟีเจอร์แนะนำอาหารลดน้ำหนักตามเกณฑ์ BMI ที่ส่งข้อมูลมา
      let { data: profile } = await supabase.from('user_profiles').select('bmi').eq('user_id', userId).single();
      const bmi = profile ? profile.bmi : 22;
      
      let replyMsg = '';
      if (userMessage.includes('มังสวิรัติ')) {
        replyMsg = `🥦 [เมนูมังสวิรัติลดน้ำหนัก]\nเช้า: ข้าวโอ๊ต + นมถั่วเหลือง\nกลางวัน: ข้าวกล้อง + เต้าหู้ผัดผัก\nเย็น: สลัดเต้าหู้ / แกงเลียงผักรวม`;
      } else if (userMessage.includes('แพ้นม') || userMessage.includes('แพ้ไข่')) {
        replyMsg = `🍽 [เมนูสำหรับผู้แพ้อาหาร]\nแนะนำใช้โปรตีนทดแทนจาก อกไก่ หรือ เต้าหู้ แทนไข่และนมวัวครับ\nอาหารว่าง: ฝรั่ง หรือ แอปเปิล 1 ผล (100 kcal)`;
      } else {
        // แนะนำตามระดับ BMI ของผู้ใช้จริงที่บันทึกไว้
        if (bmi >= 25) {
          replyMsg = `🔥 [เมนูสำหรับภาวะอ้วน (BMI: ${bmi})]\nเช้า: ไข่ต้ม 2 ฟอง + ฝรั่ง 1 ลูก\nกลางวัน: สุกี้น้ำไม่ใส่วุ้นเส้น หรือ สลัดอกไก่\nเย็น: แกงเลียงผักรวม หรือ ต้มจับฉ่าย\n*แนะนำออกกำลังกาย/เดินให้ได้ 60 นาทีต่อวันครับ`;
        } else if (bmi >= 23) {
          replyMsg = `🥗 [เมนูสำหรับน้ำหนักเกิน (BMI: ${bmi})]\nเช้า: ข้าวโอ๊ต + กล้วยครึ่งลูก\nกลางวัน: ข้าวกล้องครึ่งทัพพี + ปลานึ่ง หรือ อกไก่อบ\nเย็น: สลัดผัก + ไข่ต้ม หรือ ยำอกไก่`;
        } else {
          replyMsg = `🍽 [เมนูสำหรับน้ำหนักปกติ (BMI: ${bmi})]\nเช้า: ขนมปังโฮลวีต 2 แผ่น + ไข่ต้ม + นมจืด\nกลางวัน: ข้าวกล้อง + อกไก่ย่าง + ผัดผักรวม\nเย็น: สลัดทูน่า หรือ แกงจืดเต้าหู้หมูสับ`;
        }
      }

      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: replyMsg }] });
    }

    case 'AWAITING_FOOD_NAME': {
      const { data, error } = await supabase.rpc('search_menu', { search_term: userMessage });
      if (error || !data || data.length === 0) {
        return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: `ไม่พบเมนู "${userMessage}" ในโรงอาหารครับ` }] });
      }
      const limited = data.slice(0, 5);
      const menuList = limited.map(item => `🍽 ${item.name} (${item.shop})\n🔥 ${item.calories} kcal\n💪 P: ${item.protein}g | F: ${item.fat}g | C: ${item.carbohydrate}g`).join('\n\n');
      return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: menuList }] });
    }

    default:
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: 'สวัสดีครับ! กรุณาเลือกฟีเจอร์จากเมนูด้านล่าง หรือพิมพ์คำว่า:\n\nสุขภาพจิต\nอาหารโรงอาหาร\nแนะนำอาหารลดน้ำหนัก\nภารกิจสุขภาพประจำวัน' }],
      });
  }
}

// ฟังก์ชันแปลผลข้อมูล BMI
function translateBmi(bmi) {
  if (bmi < 18.5) return 'น้ำหนักน้อย/ต่ำกว่าเกณฑ์';
  if (bmi >= 18.5 && bmi < 23) return 'น้ำหนักปกติ';
  if (bmi >= 23 && bmi < 25) return 'น้ำหนักเกิน';
  return 'โรคอ้วน';
}

// ฟังก์ชันสร้างหน้าแดชบอร์ดสรุปความคืบหน้าภารกิจประจำวัน
async function showDailyDashboard(event, userId, profile) {
  const todayStr = new Date().toISOString().split('T')[0];
  let { data: progress } = await supabase.from('daily_progress').select('*').eq('user_id', userId).eq('log_date', todayStr).single();
  
  if (!progress) {
    const { data: newProg } = await supabase.from('daily_progress').insert({ user_id: userId, log_date: todayStr }).select().single();
    progress = newProg;
  }

  // คำนวณเปอร์เซ็นต์ความสำเร็จ (เฉลี่ยจาก 3 ภารกิจ)
  const waterPercent = Math.min((progress.water_intake / profile.water_goal) * 100, 100);
  const stepPercent = Math.min((progress.steps_count / profile.step_goal) * 100, 100);
  const stretchPercent = Math.min((progress.stretch_count / 3) * 100, 100); // เกณฑ์ขั้นต่ำยืดเส้น 3 ครั้ง/วัน
  const totalSuccess = Math.round((waterPercent + stepPercent + stretchPercent) / 3);

  const dashboardText = `🏃‍♂️ [แดชบอร์ดภารกิจประจำวัน]\n` +
    `🔥 ความสำเร็จรวม: ${totalSuccess}%\n` +
    `⭐ วันต่อเนื่อง (Streak): 7 วัน\n\n` +
    `💧 1. การดื่มน้ำ:\n` +
    `   - ทำได้: ${progress.water_intake} / ${profile.water_goal} ml\n\n` +
    `👟 2. การเดินนับก้าว:\n` +
    `   - ทำได้: ${progress.steps_count} / ${profile.step_goal} ก้าว\n\n` +
    `🧘‍♂️ 3. ยืดเส้นยืดสาย:\n` +
    `   - ทำได้: ${progress.stretch_count} / 3 ครั้ง\n\n` +
    `💡 วิธีอัปเดตภารกิจแบบด่วน:\n` +
    `• พิมพ์ "ดื่มน้ำ 300ml" เมื่อดื่มน้ำ\n` +
    `• พิมพ์ "ยืดเส้นแล้ว" เมื่อยืดเหยียดเสร็จ\n` +
    `• พิมพ์ "เดิน 1000" (ตามด้วยจำนวนก้าว)`;

  return client.replyMessage({ replyToken: event.replyToken, messages: [{ type: 'text', text: dashboardText }] });
}

app.listen(process.env.PORT || 3000, () => {
  console.log(`Server running on port ${process.env.PORT || 3000}`);
});