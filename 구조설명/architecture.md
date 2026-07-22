# NCHM Reservation Refactor Architecture

## 아키텍처 설명
현재 프로젝트는 HTML 기반 단일 페이지 애플리케이션으로, UI는 `index.html`에서 유지되고 JavaScript 로직은 기능별로 분리된 파일로 관리됩니다.

- `index.html`: UI 레이아웃과 inline event handler만 유지. 기존 ID와 클래스, 스타일 구조는 변경하지 않음.
- `config.js`: Firebase 구성 정보와 상수(`ADMIN_EMAIL`, `AGE_GROUPS`, `PURPOSES`)를 정의.
- `firebase.js`: Firebase compat SDK 초기화, `auth`, `db`, `visitLogsRef`, `arLogsRef`, `arSlotLocksRef` 참조 생성.
- `utils.js`: DOM 캐시, XSS-safe 문자 이스케이프, CSV 수식 주입 방지, 입력 검증, 공통 helper(`createSlotKey`, `collectUsers`, `validateUsers`, `formatLocalDate`, `showMessage`)를 제공.
- `visit.js`: 방문 등록 로그 저장, `visitLogs` 구독/해제, 방문 데이터 상태 유지.
- `ar.js`: AR 예약 저장, 슬롯 락 transaction, 당일/전체 AR 로그 구독, 시간대 버튼 생성, 예약 데이터 상태 유지.
- `admin.js`: 관리자 로그인/로그아웃, 세션 타임아웃, 관리자 전용 UI 전환, 로그 구독 제어.
- `nchm.js`: 페이지 초기화, 탭 전환, 폼 제출 흐름, 통계/테이블 렌더링, 엑셀 다운로드.
- 'tv.js': 티비 관리에 전반적인걸 담당  

## 현재 프로젝트 구조
```text
/Users/choewonhyeog/Documents/nchm123/nchm_visiter
├── index.html
├── nchm.css
├── styles.css
├── package.json
├── package-lock.json
├── config.js
├── firebase.js
├── utils.js
├── visit.js
├── ar.js
├── admin.js
└── nchm.js
```

## 데이터 흐름
일반 사용자는 익명 인증 후 AR 예약을 위한 시간대 조회와 예약 기능을 사용합니다. 방문 등록 시 각 방문자 정보를 수집하여 `visitLogs`에 저장하며, 관리자 모드에서는 `visitLogs`와 전체 `arLogs`를 구독하여 통계와 상세 내역을 렌더링합니다.

## AR 예약 처리 흐름
1. 사용자가 인원 수를 선택하고 AR 예약 정보를 입력합니다.
2. `utils.js`의 `validateUsers()`로 이름/성별/연령 검증을 수행합니다.
3. `ar.js`의 `reserveSlotAndSaveArLog()`가 `arSlotLocks/{slotKey}` transaction으로 슬롯 락을 선점합니다.
4. 락 성공 시 `arLogs`에 예약 로그를 저장하고, 실패 시 락이 해제되거나 예약이 취소됩니다.
5. 예약 성공 후 `generateTimeSlots()`로 최신 예약 상태를 반영합니다.

## 관리자 처리 흐름
1. `admin.js`가 `ADMIN_EMAIL`을 사용해 이메일/비밀번호 방식으로 Firebase 로그인 처리.
2. 로그인 후 토큰 이메일을 확인하여 관리자 여부를 검증.
3. 관리자 모드 진입 시 `subscribeVisitLogs()`와 `subscribeArLogsAll()`을 실행하여 데이터 구독을 시작.
4. 로그 삭제 시 `deleteArLog()`는 AR 로그와 해당 슬롯 락을 함께 제거.
5. 관리자 세션은 `resetAdminIdleTimeout()`과 사용자 활동 리스너로 자동 로그아웃을 지원.

## Firebase 데이터 구조
```text
visitLogs/{logId}
arLogs/{logId}
arSlotLocks/{slotKey}
```

- `visitLogs`: 방문 등록 정보 저장.
- `arLogs`: AR 예약 정보 저장.
- `arSlotLocks`: 예약 시간대 동시성을 제어하는 락 상태 저장.

## 보안 및 검증
- `escapeHtml()`를 사용해 동적 HTML 렌더링 시 XSS 위험을 줄임.
- CSV 다운로드 시 `sanitizeCsvField()`로 수식 주입을 방지.
- 관리자 기능은 이메일 기반 인증 이후에만 구독/삭제 기능이 활성화되도록 구현.
- 입력 검증은 클라이언트 측에서 수행되며, Firebase Rules와 함께 사용되어야 함.

## 동시성 처리 방식
AR 예약은 `arSlotLocks`의 transaction을 사용해 슬롯 선점을 먼저 수행하고, 성공 시 예약 데이터를 저장합니다. 이 패턴은 단일 RTDB 환경에서 슬롯 중복 예약을 최소화하기 위한 구조이며, 서버 측 함수가 없더라도 클라이언트 측에서 동시성 위험을 줄이도록 설계되었습니다.
