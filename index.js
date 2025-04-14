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
const PORT = 4000;

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

const pendingRequests = {};

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
        files: [`https://5851-210-119-237-101.ngrok-free.app/uploads/20250409_reAdjustPM.jpg`]
      })
    });

    res.status(200).json({ message: '반납 처리 완료' });
  } catch (err) {
    console.error('❌ 반납 처리 실패:', err);
    res.status(500).json({ message: '서버 오류' });
  }
});

// PM 위치 재조정 시 API
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

    pendingRequests[email] = { email, latitude, longitude, requestedAt: new Date() };

    res.status(200).json({ message: '조정 요청이 전송되었습니다. 관리자의 승인을 기다리는 중입니다.' });
  } catch (err) {
    console.error('❌ 조정 요청 처리 실패:', err);
    res.status(500).json({ message: '서버 오류' });
  }
});

// 사용자 리워드 승인 요청 관련 API
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

    // 1) 사용자가 "!reward" 명령을 입력한 경우
    if (msgText === '!reward') {
      const rewardInfo = getRewardByUser(senderEmail);
      // ****현재 이 부분의 경우, webhook을 https://developer.webex.com/docs/api/v1/webhooks/create-a-webhook 에서 임시로 ngrok이 바뀔때마다 url에 맞춰서 생성해 줘야 한다.
      // cho010105-6xnw.wbx.ai 계정에서 생성해야 함. 그래야 !reward가 정상적으로 일반 사용자에게서 발신됨.
      let replyText = `🎉 ${senderEmail}님의 리워드 현황:\n총 리워드: ${rewardInfo.total} 코인\n`;
      rewardInfo.details.forEach((detail, idx) => {
        replyText += `${idx + 1}. ${detail.date}: ${detail.coins} 코인\n`;
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
    // 2) 관리자가 승인/거부 명령을 입력한 경우
    else if ((msgText.startsWith('승인') || msgText.startsWith('거부')) && senderEmail === ADMIN_EMAIL) {
      const parts = msgText.split(' ').filter(p => p.trim() !== '');
      let targetEmail = null;

      if (parts.length >= 2) {
        targetEmail = parts[1].trim();
      }
      else {
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

// 현재는 임시 데이터를 사용함.
function getRewardByUser(email) {
  return {
    total: 10,
    details: [
      { date: '2023-09-01', coins: 5 },
      { date: '2023-10-15', coins: 5 }
    ]
  };
}

app.listen(PORT, () => {
  console.log(`✅ 서버 실행 중: http://localhost:${PORT}`);
});
