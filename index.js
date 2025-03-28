import express from 'express';
import cors from 'cors'; // 추가
import dotenv from 'dotenv';
import cron from 'node-cron';
import eventRoutes from './routes/events.js';
import sendDailyNotifications from './utils/sendMessage.js';

dotenv.config();

const app = express();

// ✅ CORS 허용 (기본은 모든 origin 허용)
app.use(cors());

app.use(express.json());
app.use('/api/events', eventRoutes);

// 매일 아침 9시 알림
cron.schedule('0 9 * * *', sendDailyNotifications);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
