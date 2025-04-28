# 🚀 CISCO INNOVATION CHALLENGE 2025

# 🌐 Node.js Server (Webex Embedded App + Bot API)

## 서버 아키텍처 (Cisco API 중심)

### 주요 흐름
- 사용자가 PM 반납 혹은 위치 조정을 요청
- 서버는 Webex Bot API를 통해 관리자에게 알림 전송
- 관리자는 Webex 대화에서 ‘승인’, ‘거부’ 명령 입력
- Webhook이 이를 감지하여 사용자에게 보상 또는 거절 안내 전송

---

## 사용한 기술 스택 및 API

- **Node.js (Express)**
- **Multer** – 이미지 업로드 처리
- **FormData** – Webex 메시지에 파일 첨부
- **[Webex Bot API](https://developer.webex.com/docs/api/v1/messages/create-a-message)**
- **[Webex Embedded App SDK](https://www.npmjs.com/package/@webex/embedded-app-sdk)**
- **Koyeb** – Node.js 서버 무료 배포
- 기타: `dotenv`, `cors`, `fetch`, `fs` 등

---

## 사전 준비 및 세팅

### Webex API 설정

1. Webex 개발자 포털 접속: [https://developer.webex.com/my-apps](https://developer.webex.com/my-apps)
2. Bot 생성 후 Token 발급
3. `.env` 파일에 아래와 같이 환경 변수 등록:

```env
WEBEX_BOT_TOKEN=your_bot_token_here
```
### Koyeb 배포 전 준비
	1.	서버 코드를 GitHub에 업로드
	2.	Koyeb에서 Node.js 프로젝트로 새 서비스 생성
	3.	환경 변수 설정 (WEBEX_BOT_TOKEN)
	4.	Webhook URL 등록:
https://your-koyeb-project.koyeb.app/webhook

## 주요 기능

1. **PM 반납 요청 (`/api/return`)**
   - 사용자가 PM 반납 사진을 첨부하여 요청
   - 서버는 Webex Bot을 통해 관리자에게 반납 알림 메시지와 이미지 전송
   - 사용자에게 불법 주차된 주변 PM 정리 요청 전송

2. **PM 위치 조정 요청 (`/api/pm-adjusted`)**
   - 사용자가 불법 주차된 PM을 정리하고 해당 사진 첨부
   - 서버는 Webex Bot을 통해 관리자에게 승인/거부 요청 메시지 전송
   - 요청자는 Webex에서 리워드 지급 여부를 기다림

3. **Webex Webhook 처리 (`/webhook`)**
   - 사용자가 Webex 대화창에서 `!reward` 입력 시 리워드 내역 응답
   - 관리자가 `승인 <email>` 또는 `거부 <email>` 명령 시 요청 처리
   - 승인 시 사용자에게 100 캐시 지급 및 리워드 내역 저장

4. **리워드 조회 기능**
   - 사용자가 Webex에서 `!reward` 입력 시 다음 형식으로 응답:

     ```
     🎉 example@email.com님의 리워드 현황:
     총 리워드: 300 캐시
     1. 2025년 04월 14일 04:18:36: 100 캐시
     2. 2025년 04월 15일 10:21:05: 100 캐시
     ...
     ```

---

## 서버 API 명세

| Method | Endpoint            | 설명                                 |
|--------|---------------------|--------------------------------------|
| POST   | `/api/return`       | PM 반납 요청 (이미지 + Webex 알림)   |
| POST   | `/api/pm-adjusted`  | PM 위치 조정 요청 (승인/거부 요청)   |
| POST   | `/webhook`          | Webex 메시지 수신 및 명령 처리       |

---

## 리워드 데이터 구조

- 서버 실행 중, 인메모리 객체로 사용자 리워드 내역 관리
- 실제 운영 시에는 DB로 대체 필요

```js
{
  "user@example.com": {
    total: 300,
    details: [
      { date: "2025년 04월 14일 04:18:36", cash: 100 },
      { date: "2025년 04월 15일 10:21:05", cash: 100 }
    ]
  }
}
```

## Webex 메시지 전송 예시

관리자에게 전송되는 메시지는 Webex Bot API의 `create-a-message`를 통해 다음과 같이 구성됩니다:

```js
await fetch('https://webexapis.com/v1/messages', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${BOT_TOKEN}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    toPersonEmail: email,
    text: '📸 근처에 불법 주차된 PM이 있습니다. 위치를 조정해주세요!',
    files: ['https://noble-tammara-kicksco-97f46231.koyeb.app/uploads/bodo_heatmap3.jpg']
  })
});
```
## 서버 실행 방법

### 1. `.env` 파일 설정

루트 디렉토리에 `.env` 파일을 생성하고, 아래와 같이 Webex Bot의 토큰을 입력합니다:
```env
WEBEX_BOT_TOKEN=your_webex_bot_token
PORT=4000  # (선택 사항: 기본값은 4000)
```
---

### 2. 의존성 설치

```bash
npm install
```

### 3. 서버 실행

```bash
node index.js
```
- 실행 결과 예시:
```bash
✅ 서버 실행 중: http://localhost:4000
```
