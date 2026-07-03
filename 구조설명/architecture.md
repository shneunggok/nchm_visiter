# NCHM Reservation Refactor Architecture

## 아키텍처 설명
`main.js`는 초기화와 이벤트 브리지, `firebase.js`는 Firebase 초기화와 참조, `visit.js`는 방문 등록, `reservation.js`는 AR 예약과 동시성 제어, `admin.js`는 관리자 인증과 삭제, `statistics.js`는 통계와 필터, `excel.js`는 CSV 다운로드, `utils.js`와 `validation.js`는 공통 기능을 담당합니다.

## 폴더 구조
```text
/Users/choewonhyeog/Documents/New project
├── index.html
├── styles.css
├── script.js
├── nchm.fixed.js
├── database.rules.json
├── docs/
│   └── refactor-architecture.md
└── js/
    ├── config.js
    ├── firebase.js
    ├── state.js
    ├── utils.js
    ├── validation.js
    ├── ui.js
    ├── visit.js
    ├── reservation.js
    ├── admin.js
    ├── statistics.js
    ├── excel.js
    └── main.js
```

## 데이터 흐름
일반 사용자는 익명 인증 후 AR 예약 가능 시간만 읽습니다. 방문 등록은 multi-path update로 여러 명 저장을 한 번에 처리합니다. AR 예약은 `slot lock transaction -> reservation/log/ledger multi-path update -> 실패 시 rollback` 흐름으로 동작합니다. 관리자는 이메일 기반 인증 후 방문 로그와 전체 AR 로그를 구독하고 삭제 시 audit log를 남깁니다.

## 예약 처리 흐름
1. 사용자가 시간과 인원을 입력합니다.
2. `reservation.js`가 클라이언트 검증을 수행합니다.
3. `clientRequestId`와 `reservationId`를 발급합니다.
4. `arSlotLocks/{slotId}`에 transaction으로 락을 선점합니다.
5. 성공하면 `arLogs`, `arSlotLocks`, `arRequestLedger`를 하나의 root update로 저장합니다.
6. 저장 실패 시 같은 요청이 만든 락만 rollback 합니다.
7. 만료 락은 `expiresAt` 기준으로 기회주의적으로 정리합니다.

## 관리자 처리 흐름
1. 관리자 비밀번호 입력
2. `Firebase Authentication` 이메일 로그인
3. 토큰 이메일 검증
4. `visitLogs`, `arLogs` 구독
5. 삭제 시 원본 삭제와 `auditLogs` 기록을 하나의 update로 처리

## Firebase 구조
```text
visitLogs/{logId}
arLogs/{reservationId}
arSlotLocks/{slotId}
arRequestLedger/{clientRequestId}
auditLogs/{auditId}
```

## 보안 구조
모든 입력은 JS와 Rules 양쪽에서 검증합니다. XSS 방지를 위해 관리자 렌더링과 동적 옵션 생성에 `escapeHtml()`을 사용합니다. CSV 다운로드는 수식 주입을 막기 위해 시작 문자를 이스케이프합니다. 일반 사용자는 `visitLogs`를 읽지 못하고, 관리자 전용 읽기/삭제는 이메일 룰로 제한합니다.

## 동시성 처리 방식
AR 예약은 단순 `push()`가 아니라 슬롯별 transaction 락을 먼저 획득합니다. 그 뒤 예약 본문과 락 상태를 multi-path update로 저장해 부분 성공을 줄입니다. 완전한 서버 중심 직렬화는 Cloud Functions가 있을 때 더 안전하지만, 현재 구조에서는 RTDB 단독으로 가능한 범위에서 가장 안전한 패턴에 가깝게 개선했습니다.
