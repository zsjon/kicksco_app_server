import express from 'express';
import multer from 'multer';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import fetch from 'node-fetch';
import FormData from 'form-data';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

app.use('/uploads', express.static(uploadDir));

const ADMIN_EMAIL = 'cho010105@gachon.ac.kr';
const BOT_TOKEN = process.env.WEBEX_BOT_TOKEN;

// pendingRequests: PM 위치 재조정 요청에 대해 관리자가 승인/거부할 때 사용할 임시 저장소
const pendingRequests = {};

// rewardData: 각 사용자(email)별 리워드 내역을 인메모리로 저장 (실제 운용 시 DB 사용 권장)
const rewardData = {};

// PM 반납 요청 API
app.post('/api/return', upload.single('image'), async (req, res) => {
  const { email, latitude, longitude } = req.body;
  const imagePath = req.file?.path;

  if (!email || !latitude || !longitude || !imagePath) {
    return res.status(400).json({ message: '누락된 정보가 있습니다.' });
  }

  try {
    const form = new FormData();
    const text = `📥 ${email} 님이 PM을 반납했습니다.\n위도: ${latitude}, 경도: ${longitude}`;
    form.append('toPersonEmail', ADMIN_EMAIL);
    form.append('text', text);
    form.append('files', fs.createReadStream(imagePath));
    form.append('timestamp', new Date().toISOString());
    form.append('lat', latitude);
    form.append('lng', longitude);

    await fetch('https://webexapis.com/v1/messages', {
      method: 'POST',
      headers: { Authorization: `Bearer ${BOT_TOKEN}`, ...form.getHeaders() },
      body: form
    });

    await fetch('https://webexapis.com/v1/messages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${BOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        toPersonEmail: email,
        text: '📸 근처에 불법 주차된 PM이 있습니다. 위치를 조정해주세요!',
        files: [`https://noble-tammara-kicksco-97f46231.koyeb.app/uploads/20250409_reAdjustPM.jpg`]
      })
    });

    res.status(200).json({ message: '반납 처리 완료' });
  } catch (err) {
    console.error('❌ 반납 처리 실패:', err);
    res.status(500).json({ message: '서버 오류' });
  }
});

// PM 위치 재조정 요청 API
app.post('/api/pm-adjusted', upload.single('image'), async (req, res) => {
  const { email, latitude, longitude, message } = req.body;
  const imagePath = req.file?.path;

  if (!email || !latitude || !longitude || !imagePath) {
    return res.status(400).json({ message: '필수 항목 누락' });
  }

  try {
    const form = new FormData();
    let text = `📤 ${email} 님의 PM 위치 조정 요청\n위도: ${latitude}, 경도: ${longitude}\n요청자: ${email}`;
    if (message?.trim()) {
      text = `📤 ${email} 님의 PM 위치 조정 요청\n메시지: ${message}\n위도: ${latitude}, 경도: ${longitude}\n요청자: ${email}`;
    }
    form.append('toPersonEmail', ADMIN_EMAIL);
    form.append('text', text);
    form.append('files', fs.createReadStream(imagePath));

    await fetch('https://webexapis.com/v1/messages', {
      method: 'POST',
      headers: { Authorization: `Bearer ${BOT_TOKEN}`, ...form.getHeaders() },
      body: form
    });

    // 요청을 pendingRequests에 저장하여 나중에 관리자가 승인/거부할 수 있도록 함.
    pendingRequests[email] = { email, latitude, longitude, requestedAt: new Date() };

    res.status(200).json({ message: '조정 요청이 전송되었습니다. 관리자의 승인을 기다리는 중입니다.' });
  } catch (err) {
    console.error('❌ 조정 요청 처리 실패:', err);
    res.status(500).json({ message: '서버 오류' });
  }
});

// 웹훅 엔드포인트: Webex에서 메시지 이벤트를 수신하여 !reward, 승인/거부 명령 처리
app.post('/webhook', async (req, res) => {
  try {
    const event = req.body;
    const messageId = event.data.id;
    const messageRes = await fetch(`https://webexapis.com/v1/messages/${messageId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${BOT_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    const messageData = await messageRes.json();

    const msgText = messageData.text ? messageData.text.trim() : '';
    const senderEmail = messageData.personEmail;

    // 1) 사용자가 "!reward" 명령을 입력한 경우 : 개인 리워드 내역을 보여줌
    if (msgText === '!reward') {
      const rewardInfo = getRewardByUser(senderEmail);
      let replyText = `🎉 ${senderEmail}님의 리워드 현황:\n총 리워드: ${rewardInfo.total} cash\n`;
      rewardInfo.details.forEach((detail, idx) => {
        replyText += `${idx + 1}. ${detail.date}: ${detail.cash} cash\n`;
      });
      await fetch('https://webexapis.com/v1/messages', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${BOT_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          toPersonEmail: senderEmail,
          text: replyText
        })
      });
    }
    // 2) 관리자가 "승인" 또는 "거부" 명령을 입력한 경우 (관리자만)
    else if ((msgText.startsWith('승인') || msgText.startsWith('거부')) && senderEmail === ADMIN_EMAIL) {
      const parts = msgText.split(' ').filter(p => p.trim() !== '');
      let targetEmail = null;
      if (parts.length >= 2) {
        targetEmail = parts[1].trim();
      } else {
        const pendingKeys = Object.keys(pendingRequests);
        if (pendingKeys.length === 1) {
          targetEmail = pendingKeys[0];
        } else if (pendingKeys.length === 0) {
          await fetch('https://webexapis.com/v1/messages', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${BOT_TOKEN}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              toPersonEmail: ADMIN_EMAIL,
              text: '처리할 리워드 승인 요청이 없습니다.'
            })
          });
          return res.sendStatus(200);
        } else {
          await fetch('https://webexapis.com/v1/messages', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${BOT_TOKEN}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              toPersonEmail: ADMIN_EMAIL,
              text: '여러 개의 리워드 승인 요청이 있습니다. 승인/거부 시 처리할 요청의 이메일을 명시해주세요.'
            })
          });
          return res.sendStatus(200);
        }
      }

      if (targetEmail && pendingRequests[targetEmail]) {
        if (msgText.startsWith('승인')) {
          // 리워드 업데이트: 사용자의 rewardData에 100 cash를 추가
          if (!rewardData[targetEmail]) {
            rewardData[targetEmail] = { total: 0, details: [] };
          }
          rewardData[targetEmail].total += 100;
          rewardData[targetEmail].details.push({
            date: new Date().toISOString(),
            cash: 100
          });
          await fetch('https://webexapis.com/v1/messages', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${BOT_TOKEN}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              toPersonEmail: targetEmail,
              text: `🎁 ${targetEmail}님의 PM 위치 재조정 리워드가 지급되었습니다!`
            })
          });
        } else if (msgText.startsWith('거부')) {
          await fetch('https://webexapis.com/v1/messages', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${BOT_TOKEN}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              toPersonEmail: targetEmail,
              text: `❌ ${targetEmail}님의 PM 위치 재조정이 거부되었습니다. 다시 주차해주세요.`
            })
          });
        }
        delete pendingRequests[targetEmail];
        await fetch('https://webexapis.com/v1/messages', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${BOT_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            toPersonEmail: ADMIN_EMAIL,
            text: `${targetEmail}에 대한 요청이 "${parts[0]}" 처리되었습니다.`
          })
        });
      } else {
        await fetch('https://webexapis.com/v1/messages', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${BOT_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            toPersonEmail: ADMIN_EMAIL,
            text: `${targetEmail}에 대한 승인 요청이 없습니다.`
          })
        });
      }
    }
    res.sendStatus(200);
  } catch (err) {
    console.error('웹훅 처리 실패:', err);
    res.sendStatus(500);
  }
});

// 사용자 리워드 정보를 반환하는 함수 (인메모리 저장; 실제로는 DB 사용 필요)
function getRewardByUser(email) {
  return rewardData[email] ? rewardData[email] : { total: 0, details: [] };
}

app.listen(PORT, () => {
  console.log(`✅ 서버 실행 중: http://localhost:${PORT}`);
});