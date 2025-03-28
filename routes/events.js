
import express from 'express';
import { saveEvent } from '../utils/fileManager.js';

const router = express.Router();

router.post('/', (req, res) => {
  try {
    const { email, date, event } = req.body;
    console.log('[server] 요청 도착:', { email, date, event });

    if (!email || !date || !event) {
      return res.status(400).json({ message: '입력 누락' });
    }

    saveEvent(email, date, event); // 이 안에서 문제가 생겼을 수도 있음

    res.json({ message: '저장 완료' });
  } catch (err) {
    console.error('❌ 서버 에러 발생:', err);
    res.status(500).json({ message: '서버 에러' });
  }
});


export default router;
