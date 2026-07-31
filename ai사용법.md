# AI를 이용한 홈페이지 수정 방법 — 완전 초보자용

이 문서는 코딩을 한 번도 해보지 않은 사람이 이 프로젝트를 내려받고, AI의 도움을 받아 안전하게 수정하고, 수정 결과를 확인하는 방법을 설명합니다.

아래 내용을 처음부터 순서대로 따라 하세요. 모르는 명령어가 나오더라도 건너뛰지 마세요.

---

## 가장 중요한 원칙

1. 코드 수정이나 홈페이지 화면 수정에는 **GPT-5.6-Sol, 추론 수준 Low(낮음) 이상**을 사용하세요.
2. 코드는 반드시 **Visual Studio Code(VS Code)**에서 여세요.
3. GitHub 코드는 웹사이트에서 한 파일씩 복사하지 말고 **터미널에서 Git으로 내려받으세요.**
4. 수정 전에는 항상 `git status`를 확인하세요.
5. 실제 운영 Firebase 데이터로 바로 시험하지 마세요. 먼저 Firebase Emulator에서 검사하세요.
6. AI가 수정했다고 바로 믿지 말고 자동 테스트와 화면 확인을 모두 진행하세요.
7. 관리자의 별도 승인이 없으면 운영 배포, Firebase Rules 배포, 데이터 삭제를 하지 마세요.
8. 관리자 비밀번호, GitHub 비밀번호, 인증 토큰은 AI 대화나 코드에 입력하지 마세요.
9. `git reset --hard`, `git clean -fd`, 강제 푸시(`git push --force`)는 사용하지 마세요.
10. 문제가 생기면 더 수정하기 전에 멈추고 현재 화면, 오류 문구, `git status` 결과를 기록하세요.

---

## 1. 먼저 알아둘 용어

| 용어 | 쉬운 설명 |
|---|---|
| 프로젝트 | 홈페이지 코드 전체가 들어 있는 폴더 |
| 저장소(Repository) | GitHub에 보관된 프로젝트 |
| Git | 파일이 언제 어떻게 바뀌었는지 기록하는 도구 |
| GitHub | Git 프로젝트를 인터넷에 보관하고 공유하는 서비스 |
| 터미널 | 글자로 컴퓨터에 명령을 내리는 프로그램 |
| VS Code | 프로젝트 파일을 보고 수정하는 프로그램 |
| 브랜치(Branch) | 원본을 건드리지 않고 별도로 수정하는 작업 공간 |
| 커밋(Commit) | 수정 내용을 하나의 복구 가능한 기록으로 저장하는 것 |
| 푸시(Push) | 내 컴퓨터의 커밋을 GitHub에 올리는 것 |
| 풀 리퀘스트(PR) | 수정한 브랜치를 운영 코드에 합쳐 달라고 요청하는 것 |
| Firebase | 로그인, 데이터베이스 등을 제공하는 서비스 |
| Rules | Firebase 데이터의 읽기·쓰기 권한을 정하는 규칙 |
| Emulator | 실제 운영 데이터 대신 내 컴퓨터에서 사용하는 테스트용 Firebase |
| 콘솔 | 브라우저나 터미널에 표시되는 오류·실행 기록 |
| 회귀 테스트 | 새 수정 때문에 기존 기능이 망가지지 않았는지 확인하는 테스트 |

---

## 2. 이 프로젝트에서 중요한 파일

프로젝트 주소:

```text
https://github.com/shneunggok/nchm_visiter.git
```

주요 파일은 다음과 같습니다.

| 파일 또는 폴더 | 역할 | 주의 수준 |
|---|---|---|
| `index.html` | 방문 등록, AR 예약, 관리자 화면의 기본 HTML | 중간 |
| `nchm.css` | 일반 홈페이지와 관리자 일부 화면 디자인 | 중간 |
| `tv.html` | 실제 TV 화면의 기본 HTML | 중간 |
| `tv.css` | TV 화면 디자인 | 중간 |
| `tv-admin.css` | TV 관리자 화면 디자인 | 중간 |
| `js/nchm.js` | 메인 화면 전환, 폼 제출, 목록 렌더링 등 | 높음 |
| `js/visit.js` | 방문 등록 저장 로직 | 매우 높음 |
| `js/ar.js` | AR 예약, 슬롯 중복 방지 로직 | 매우 높음 |
| `js/requests.js` | 중복 저장 방지용 요청 식별 및 claim 처리 | 매우 높음 |
| `js/admin.js` | 관리자 로그인·로그아웃·세션 처리 | 매우 높음 |
| `js/admin-data.js` | 관리자 목록, 통계, 페이지네이션, CSV 조회 | 높음 |
| `js/tv.js` | TV 화면 순환, Firebase 구독, 자동 복구 | 높음 |
| `js/tv-attendance.js` | TV 출석 이벤트와 순위 | 높음 |
| `js/tv-admin.js` | TV 관리자 설정과 콘텐츠 편집 | 높음 |
| `js/tv-common.js` | TV와 TV 관리자가 같이 사용하는 공통 함수 | 높음 |
| `js/firebase.js` | Firebase 연결과 Emulator 연결 | 매우 높음 |
| `js/config.js` | Firebase 프로젝트 설정과 서비스 상수 | 매우 높음 |
| `database.rules.json` | Firebase Realtime Database 권한 규칙 | 최고 위험 |
| `tests/` | 기존 기능이 망가지지 않았는지 검사하는 테스트 | 수정 가능 |
| `docs/OPERATIONS_TESTING.md` | 운영 전 통합 검사 절차 | 참고 |
| `admin-tool/` | 별도 관리자 도구 구조 | 요청이 없으면 수정 금지 |
| `node_modules/` | 설치된 외부 패키지 | 직접 수정·업로드 금지 |
| `.deploy-backups/` | 배포 전 Rules 등의 로컬 백업 | 삭제 금지 |

### 어떤 파일을 수정해야 할지 모르겠다면

직접 추측하지 말고 AI에게 다음과 같이 요청하세요.

```text
이 기능이 어떤 파일에서 처리되는지 먼저 추적해 주세요.
아직 코드는 수정하지 말고 관련 파일, 데이터 흐름, 수정 후보만 알려주세요.
```

특히 `js/visit.js`, `js/ar.js`, `js/requests.js`, `js/firebase.js`, `database.rules.json`은 저장과 권한에 직접 영향을 줍니다. 화면 글자나 색상을 바꾸는 작업인데 이 파일들이 수정 목록에 포함되었다면 이유를 반드시 확인하세요.

---

## 3. 준비물과 계정

다음 항목이 필요합니다.

- 인터넷이 연결된 컴퓨터
- GitHub 계정
- 이 GitHub 저장소에 코드를 올릴 권한
- Visual Studio Code
- Git
- Node.js LTS 버전
- Chrome 또는 Edge
- 운영 배포를 할 경우에만 Firebase 프로젝트 권한

권한이 없다면 코드를 내려받고 로컬에서 수정·검사하는 것은 가능할 수 있지만, GitHub 푸시나 Firebase 배포는 할 수 없습니다. 권한 오류가 나오면 비밀번호를 반복 입력하지 말고 프로젝트 관리자에게 권한을 요청하세요.

---

## 4. 프로그램 설치

### 4-1. Visual Studio Code 설치

1. 브라우저에서 다음 주소를 엽니다.
   - <https://code.visualstudio.com/>
2. 현재 운영체제에 맞는 설치 파일을 받습니다.
3. 설치 파일을 실행합니다.
4. Windows에서는 설치 과정에서 가능하면 다음 항목을 선택합니다.
   - `Add to PATH`
   - `Open with Code`
5. 설치가 끝나면 VS Code를 한 번 실행합니다.

#### macOS에서 `code` 명령어 사용 설정

1. VS Code를 엽니다.
2. 키보드에서 `Command + Shift + P`를 누릅니다.
3. 검색창에 다음을 입력합니다.

```text
Shell Command: Install 'code' command in PATH
```

4. 해당 항목을 누릅니다.
5. 터미널을 완전히 닫았다가 다시 엽니다.

#### Windows에서 `code` 명령어가 안 될 때

VS Code를 다시 설치하면서 `Add to PATH`를 선택하거나, VS Code에서 `파일 → 폴더 열기`로 프로젝트 폴더를 직접 열어도 됩니다.

---

### 4-2. Git 설치

#### macOS

터미널을 열고 다음 명령어를 입력합니다.

```sh
git --version
```

버전 번호가 나오면 설치되어 있습니다. 설치 안내 창이 뜨면 안내에 따라 Apple Command Line Tools를 설치하세요.

#### Windows

1. <https://git-scm.com/>에서 Git for Windows를 설치합니다.
2. 특별한 이유가 없다면 기본 설정으로 계속 진행합니다.
3. 설치가 끝나면 PowerShell을 다시 열고 확인합니다.

```powershell
git --version
```

정상 예:

```text
git version 2.xx.x
```

---

### 4-3. Node.js 설치

1. <https://nodejs.org/>를 엽니다.
2. **LTS**라고 표시된 버전을 설치합니다.
3. 설치 후 터미널을 다시 열고 다음 두 명령어를 실행합니다.

```sh
node --version
npm --version
```

두 명령어 모두 숫자로 된 버전이 나오면 정상입니다.

`node: command not found` 또는 `node을(를) 찾을 수 없습니다`가 나오면 Node.js 설치 후 터미널을 다시 열지 않았거나 PATH 설정이 반영되지 않은 것입니다.

---

### 4-4. VS Code 확장 프로그램

VS Code 왼쪽의 블록 모양 `Extensions` 버튼을 누르고 다음 확장 프로그램을 설치할 수 있습니다.

- `Live Server`: HTML 화면을 간단히 띄울 때 사용
- `GitHub Pull Requests and Issues`: GitHub PR 확인에 사용

확장 프로그램은 보조 도구입니다. 프로젝트 실행과 자동 테스트에는 터미널 명령어를 사용하는 방법이 더 정확합니다.

---

## 5. 터미널 여는 방법

### macOS

다음 중 하나를 사용합니다.

- `Command + Space`를 누르고 `터미널` 검색
- VS Code 상단 메뉴에서 `Terminal → New Terminal`
- 단축키 ``Control + ` `` 사용

### Windows

다음 중 하나를 사용합니다.

- 시작 메뉴에서 `PowerShell` 검색
- 프로젝트 폴더에서 마우스 오른쪽 버튼 → `터미널에서 열기`
- VS Code 상단 메뉴에서 `Terminal → New Terminal`

### 현재 위치 확인

macOS:

```sh
pwd
```

Windows PowerShell:

```powershell
Get-Location
```

터미널 명령어는 현재 위치를 기준으로 실행됩니다. 엉뚱한 폴더에서 실행하면 파일을 찾지 못합니다.

---

## 6. GitHub에서 프로젝트 내려받기

처음 한 번만 진행합니다.

### macOS 예시

```sh
mkdir -p ~/Documents/projects
cd ~/Documents/projects
git clone https://github.com/shneunggok/nchm_visiter.git
cd nchm_visiter
code .
```

### Windows PowerShell 예시

```powershell
New-Item -ItemType Directory -Force "$HOME\Documents\projects"
Set-Location "$HOME\Documents\projects"
git clone https://github.com/shneunggok/nchm_visiter.git
Set-Location nchm_visiter
code .
```

각 명령어의 의미:

1. 작업용 `projects` 폴더를 만듭니다.
2. 해당 폴더로 이동합니다.
3. GitHub 코드를 `nchm_visiter` 폴더로 내려받습니다.
4. 프로젝트 폴더 안으로 이동합니다.
5. 현재 폴더를 VS Code로 엽니다.

정상적으로 열리면 VS Code 왼쪽 파일 목록에 `index.html`, `tv.html`, `js`, `tests`, `package.json` 등이 보여야 합니다.

### `destination path already exists` 오류

이미 같은 이름의 폴더가 있다는 뜻입니다. 무조건 삭제하지 마세요. 기존 폴더에 중요한 수정이 있을 수 있습니다.

기존 프로젝트를 열려면:

```sh
cd ~/Documents/projects/nchm_visiter
code .
```

Windows에서는:

```powershell
Set-Location "$HOME\Documents\projects\nchm_visiter"
code .
```

### GitHub 로그인을 요구할 때

- 코드를 읽는 권한만 필요한 공개 저장소라면 일반적으로 clone이 가능합니다.
- 푸시할 때는 GitHub 로그인이 필요합니다.
- GitHub는 계정 비밀번호 대신 브라우저 인증이나 Personal Access Token을 요구할 수 있습니다.
- 토큰을 AI에게 보내거나 문서에 저장하지 마세요.

---

## 7. 프로젝트 설치

VS Code에서 터미널을 열고 프로젝트 폴더인지 확인합니다.

```sh
pwd
```

경로 마지막이 `nchm_visiter`인지 확인한 다음 실행합니다.

```sh
npm ci
```

이 명령은 `package-lock.json`에 기록된 정확한 버전의 테스트 도구를 설치합니다.

설치 후 `node_modules` 폴더가 생깁니다. 이 폴더는 매우 크며 자동 생성되는 폴더입니다.

- `node_modules` 내부 파일을 직접 수정하지 마세요.
- GitHub에 올리지 마세요.
- 문제가 생기면 임의로 일부 파일만 지우지 말고 담당자에게 문의하세요.

---

## 8. 수정하기 전에 현재 상태 확인

매번 작업을 시작할 때 다음 명령어를 실행합니다.

```sh
git status
```

### 안전한 상태

다음과 비슷하게 나오면 아직 수정된 파일이 없습니다.

```text
nothing to commit, working tree clean
```

### 수정된 파일이 이미 표시될 때

예:

```text
modified: index.html
```

이 파일은 이전 작업자가 수정했거나 아직 저장하지 않은 작업일 수 있습니다.

이때 하지 말아야 할 것:

```sh
git reset --hard
git checkout -- index.html
git clean -fd
```

위 명령은 다른 사람의 작업을 지울 수 있습니다.

대신 다음 내용을 관리자 또는 AI에게 알려주세요.

```text
작업 시작 전 git status에 index.html 수정이 이미 표시됩니다.
이 변경을 보존하고 이번 작업 파일만 수정해 주세요.
```

---

## 9. 새 작업 브랜치 만들기

운영 코드인 `main`에서 바로 수정하지 않는 것이 안전합니다.

먼저 최신 원본을 받습니다.

```sh
git switch main
git pull origin main
```

단, `git status`에 기존 수정 파일이 있다면 위 명령을 실행하기 전에 멈추세요. 기존 변경과 충돌할 수 있습니다.

새 브랜치를 만듭니다.

```sh
git switch -c fix/tv-event-display
```

브랜치 이름 예:

```text
fix/ar-reservation-error
fix/tv-event-display
fix/admin-scroll
feature/tv-duration-options
docs/ai-guide
```

현재 브랜치 확인:

```sh
git branch --show-current
```

`main`이 아니라 방금 만든 브랜치 이름이 나와야 합니다.

---

## 10. AI 코딩 도구 설정

코드 또는 홈페이지 화면을 수정할 때 다음 기준을 사용하세요.

- 모델: **GPT-5.6-Sol**
- 추론 수준: **Low(낮음) 이상**
- 프로젝트 접근 범위: `nchm_visiter` 폴더
- 터미널 작업 위치: `nchm_visiter` 폴더

모델 목록에 GPT-5.6-Sol이 보이지 않으면 임의로 낮은 모델을 선택하지 말고 계정 또는 도구 관리자에게 문의하세요.

### AI에게 처음 보내는 기본 요청문

아래 문장을 복사한 뒤 원하는 작업을 마지막에 추가하세요.

```text
현재 프로젝트 전체를 다시 작성하지 말고 요청한 기능만 최소 범위로 수정해 주세요.

작업 전에 반드시:
1. git status로 기존 변경을 확인할 것
2. 관련 HTML, CSS, JavaScript 호출 흐름을 먼저 추적할 것
3. 기존 데이터 필드명과 Firebase 구조를 유지할 것
4. 운영 Firebase 데이터와 Rules를 배포하거나 수정하지 말 것
5. 관련 없는 기존 변경 파일을 되돌리거나 포함하지 말 것

수정 후 반드시:
1. 변경 파일 목록을 알려줄 것
2. npm run check를 실행할 것
3. Firebase 관련 수정이면 npm run test:emulator도 실행할 것
4. 화면에서 직접 확인할 수 있는 절차를 알려줄 것
5. 운영 배포는 별도 승인 전까지 하지 말 것

이번 요청:
[여기에 원하는 수정 내용을 자세히 작성]
```

### 화면 오류를 요청할 때 같이 보내야 하는 것

- 문제가 보이는 화면 캡처
- 어떤 버튼을 눌렀는지
- 정상이라면 어떻게 보여야 하는지
- 오류가 항상 발생하는지 가끔 발생하는지
- PC인지 모바일인지
- 브라우저 이름
- 콘솔 오류가 있다면 오류 문구

좋은 요청 예:

```text
TV 관리에서 일반 행사 수정 버튼을 누르면 모달은 열리지만 마우스 휠과
모바일 손가락 스크롤이 작동하지 않습니다.

일반 행사와 출석 이벤트 모두 확인해 주세요.
배경 스크롤은 막아도 되지만 모달 내부는 스크롤되어야 합니다.
저장, 취소, ESC, 바깥 영역 클릭으로 닫을 때 body 스크롤이 복구되어야 합니다.
관련 없는 방문 등록과 AR 예약은 수정하지 마세요.
```

나쁜 요청 예:

```text
안 되니까 전부 고쳐줘.
```

이렇게 요청하면 AI가 필요 이상으로 많은 파일을 바꿀 수 있습니다.

---

## 11. 진단만 받고 싶을 때와 실제 수정할 때

원인만 알고 싶다면 반드시 다음 문장을 넣으세요.

```text
원인만 확인하고 코드는 수정하지 마세요.
```

실제 수정을 원한다면:

```text
원인을 재현한 뒤 필요한 부분만 실제 코드에 수정해 주세요.
수정 후 테스트까지 진행하고 운영에는 배포하지 마세요.
```

진단 요청과 수정 요청을 구분하지 않으면 AI가 원치 않는 변경을 만들 수 있습니다.

---

## 12. 홈페이지를 안전하게 실행하는 방법

### 매우 중요한 주의사항

이 프로젝트는 로컬 주소에서 그냥 열면 설정에 따라 실제 Firebase에 연결될 수 있습니다.

운영 데이터에 영향을 주지 않으려면 주소 끝에 반드시 다음 값을 사용하세요.

```text
?firebaseEmulator=1
```

이 값은 `localhost` 또는 `127.0.0.1`에서만 Emulator 연결을 활성화합니다.

### 터미널 1: Firebase Emulator 실행

VS Code에서 새 터미널을 열고 실행합니다.

```sh
npx firebase emulators:start --only auth,database --project demo-nchm
```

터미널을 닫지 말고 그대로 둡니다.

### 터미널 2: 홈페이지 서버 실행

VS Code에서 터미널 오른쪽의 `+` 버튼을 눌러 두 번째 터미널을 만든 다음 실행합니다.

macOS:

```sh
python3 -m http.server 8000
```

Windows에서 Python이 설치되어 있다면:

```powershell
py -m http.server 8000
```

### 브라우저 주소

일반 홈페이지:

```text
http://127.0.0.1:8000/index.html?firebaseEmulator=1
```

TV 화면:

```text
http://127.0.0.1:8000/tv.html?firebaseEmulator=1
```

TV 미리보기 조작 버튼 포함:

```text
http://127.0.0.1:8000/tv.html?preview=1&firebaseEmulator=1
```

### 서버 종료

각 터미널을 클릭하고 키보드에서 다음을 누릅니다.

```text
Control + C
```

서버가 종료되면 해당 주소는 더 이상 열리지 않습니다.

### `Address already in use` 오류

8000번 포트를 다른 프로그램이 사용하고 있다는 뜻입니다. 다른 포트로 실행합니다.

```sh
python3 -m http.server 8001
```

그다음 주소도 8001로 변경합니다.

```text
http://127.0.0.1:8001/index.html?firebaseEmulator=1
```

---

## 13. 자동 테스트 실행

### 일반 회귀 검사

```sh
npm run check
```

이 검사는 다음 항목을 포함합니다.

- 방문 등록 중복 방지
- AR 예약과 슬롯 잠금
- 관리자 조회와 페이지네이션
- 전체 기간 통계와 CSV
- TV 구독 중복과 자동 복구
- TV 관리자 기능
- JavaScript 문법 오류

마지막에 다음과 비슷하게 나와야 합니다.

```text
pass 73
fail 0
```

테스트 개수는 기능 추가에 따라 달라질 수 있습니다. 중요한 것은 `fail 0`이고 명령어가 오류 없이 끝나는 것입니다.

일부 장애 복구 테스트는 `permission_denied` 또는 `NETWORK_ERROR` 문구를 일부러 출력합니다. 최종 결과가 `fail 0`이면 의도된 오류 상황을 검사한 것일 수 있습니다.

### Firebase Rules와 실제 트랜잭션 검사

Firebase, 인증, 방문 저장, AR 저장, Rules를 수정했다면 반드시 실행합니다.

```sh
npm run test:emulator
```

이 검사는 실제 운영 데이터가 아닌 `demo-nchm` 테스트 환경을 사용합니다.

### 테스트가 실패하면

1. 실패한 테스트 이름을 복사합니다.
2. 그 위와 아래의 오류 문구를 복사합니다.
3. AI에게 다음과 같이 요청합니다.

```text
npm run check에서 다음 테스트가 실패했습니다.
오류를 숨기거나 테스트를 삭제하지 말고 실제 원인을 수정해 주세요.

[오류 내용 붙여넣기]
```

테스트를 통과시키려고 테스트 자체를 삭제하거나 조건을 약하게 바꾸면 안 됩니다.

---

## 14. 화면에서 직접 확인해야 하는 항목

자동 테스트가 통과해도 화면 문제는 남을 수 있습니다.

### 일반 홈페이지

- 첫 화면 로딩이 끝나는가
- 방문 등록 인원 추가·삭제가 되는가
- 방문 등록 버튼을 빠르게 눌러도 한 번만 처리되는가
- AR 날짜와 시간이 표시되는가
- 이미 예약된 시간을 다시 선택할 수 없는가
- 모바일 폭에서 버튼과 글자가 잘리지 않는가

### 관리자

- 관리자 로그인과 종료가 되는가
- 방문 상세 목록이 최신 시간순으로 보이는가
- 이전·다음 페이지가 작동하는가
- 선택 기간 통계가 100건을 넘어도 전체 기간 기준인가
- 선택 기간 전체 CSV가 내려받아지는가
- 일반 행사와 출석 이벤트 수정 모달이 스크롤되는가

### TV

- 환영, 방문자, 순위, AR, 행사, 공지가 순환되는가
- 이미지 행사와 이미지 없는 행사가 모두 표시되는가
- 이미지 행사는 전체 화면으로 보이는가
- 텍스트 행사는 카드로 보이는가
- 화면별 유지 시간이 관리자 설정과 일치하는가
- 네트워크를 잠시 끊었다가 연결해도 새로고침 없이 복구되는가

### PC와 모바일

Chrome 개발자 도구를 열어 다음 크기를 확인합니다.

- 모바일: `390 × 844`
- 데스크톱: `1440 × 900`
- TV: `1920 × 1080`

Chrome 개발자 도구:

- macOS: `Command + Option + I`
- Windows: `F12` 또는 `Control + Shift + I`

---

## 15. AI가 바꾼 파일 확인

터미널에서 확인합니다.

```sh
git status --short
```

예:

```text
 M js/tv.js
 M tv.css
 M tests/stability.test.js
```

파일 내용을 비교하려면:

```sh
git diff
```

파일 이름만 확인하려면:

```sh
git diff --name-only
```

공백 오류 확인:

```sh
git diff --check
```

### 확인해야 할 질문

- 요청한 기능과 관계없는 파일이 수정되었는가
- `database.rules.json`이 이유 없이 수정되었는가
- `js/config.js`의 Firebase 프로젝트 정보가 바뀌었는가
- 관리자 이메일이나 비밀번호가 코드에 새로 들어갔는가
- 테스트 파일이 삭제되었는가
- 기존 필드명이 삭제되었는가
- AI가 운영 배포까지 실행했는가

이상한 파일이 보이면 직접 되돌리지 말고 AI에게 이유를 물으세요.

```text
이번 요청과 관계없어 보이는 index.html 변경이 있습니다.
언제 생긴 변경인지 확인하고, 제 기존 변경이면 보존해 주세요.
임의로 되돌리지 마세요.
```

---

## 16. 커밋 만들기

테스트와 수동 확인이 끝난 뒤에만 커밋합니다.

### 파일을 하나씩 선택

예:

```sh
git add js/tv.js tv.css tests/stability.test.js
```

초보자는 다음 명령을 피하는 것이 좋습니다.

```sh
git add .
```

`git add .`은 관련 없는 파일, 로그, 임시 파일까지 한꺼번에 포함할 수 있습니다.

### 커밋에 포함될 내용 확인

```sh
git diff --cached
```

파일 이름만 확인:

```sh
git diff --cached --name-only
```

### 커밋

```sh
git commit -m "Fix TV event rotation"
```

커밋 메시지는 무엇을 바꿨는지 짧게 작성합니다.

예:

```text
Fix admin modal scrolling
Fix AR authentication recovery
Show all active TV events
Expand TV slide duration choices
Update beginner AI guide
```

커밋 후 확인:

```sh
git status
git log -1 --oneline
```

---

## 17. GitHub에 올리기

현재 브랜치를 GitHub에 처음 올릴 때:

```sh
git push -u origin 현재-브랜치-이름
```

예:

```sh
git push -u origin fix/tv-event-display
```

두 번째부터는:

```sh
git push
```

GitHub에 들어가면 `Compare & pull request` 버튼이 표시될 수 있습니다.

PR 설명에 다음을 작성하세요.

```text
## 변경 내용
- 이미지 행사와 텍스트 행사를 TV에서 모두 순환 표시

## 변경 파일
- js/tv.js
- tv.css
- tests/stability.test.js

## 테스트
- npm run check 통과
- 수동 TV 미리보기 확인

## 제외
- Firebase Rules 변경 없음
- 운영 데이터 변경 없음
```

PR을 만들었다고 운영 코드가 바로 바뀌는 것은 아닙니다. 담당자가 내용을 확인하고 `main`에 합쳐야 합니다.

---

## 18. 배포 전에 반드시 확인

이 프로젝트의 `firebase.json`에는 현재 Realtime Database Rules와 Emulator 설정이 있으며, Firebase Hosting 설정은 없습니다.

따라서 다음 명령을 무작정 실행하면 안 됩니다.

```sh
firebase deploy
```

저장소 코드만으로는 프런트엔드가 GitHub Pages, 별도 웹 서버, 다른 배포 서비스 중 어디에서 운영되는지 확정할 수 없습니다. 홈페이지 배포 방식은 프로젝트 관리자에게 먼저 확인하세요.

### 운영 배포 승인 요청 예시

```text
로컬 수정과 테스트가 완료되었습니다.

변경 파일:
- js/tv-admin.js
- tests/tv-admin.test.js

자동 테스트:
- npm run check 통과

Firebase Rules 변경:
- 없음

운영 데이터 변경:
- 없음

이 브랜치를 운영에 반영해도 되는지 승인 부탁드립니다.
현재 프런트엔드 배포 방식도 함께 알려주세요.
```

---

## 19. Firebase Rules 배포

이 절차는 `database.rules.json`을 실제로 수정했고, Emulator 테스트가 통과했으며, 운영 배포 승인을 받은 경우에만 진행합니다.

### 19-1. 운영 Rules 백업

1. <https://console.firebase.google.com/>에 접속합니다.
2. 프로젝트 `nchm` 또는 프로젝트 ID `nchm-131bb`를 선택합니다.
3. `Realtime Database`로 이동합니다.
4. 상단의 `규칙` 탭을 엽니다.
5. 현재 Rules 전체를 복사합니다.
6. `.deploy-backups/날짜-작업명/database.rules.json` 같은 별도 백업 파일로 저장합니다.

예:

```text
.deploy-backups/20260731-before-tv-change/database.rules.json
```

백업 폴더는 Git에 올라가지 않도록 설정되어 있습니다. 삭제하지 마세요.

### 19-2. Firebase 로그인

```sh
npx firebase login
```

브라우저가 열리면 권한이 있는 Google 계정으로 로그인합니다.

### 19-3. Rules 테스트

```sh
npm run test:emulator
```

실패가 하나라도 있으면 배포하지 않습니다.

### 19-4. Rules만 배포

```sh
npx firebase deploy --only database --project nchm-131bb
```

`--only database`를 빼면 의도하지 않은 다른 Firebase 항목이 배포될 수 있으므로 반드시 넣습니다.

### 19-5. 배포 후 확인

- Firebase Console의 Rules 내용이 로컬 `database.rules.json`과 같은가
- 비로그인 접근이 계속 차단되는가
- 익명 사용자 방문 등록과 AR 예약이 되는가
- 관리자 읽기·수정·삭제가 되는가
- `requestClaims` 부모 목록 읽기가 차단되는가

---

## 20. 문제 발생 시 되돌리는 방법

### 아직 커밋하지 않은 경우

직접 명령어로 되돌리기 전에 AI 또는 담당자에게 문의하세요. 작업 시작 전부터 존재하던 변경까지 함께 지울 수 있습니다.

먼저 확인:

```sh
git status --short
git diff
```

### 이미 커밋한 경우

기록을 지우는 `reset` 대신 되돌림 커밋을 사용합니다.

```sh
git log --oneline -10
git revert 되돌릴-커밋-해시
git push
```

예:

```sh
git revert 9049cf1
```

### 운영 Rules에 문제가 생긴 경우

1. 백업한 이전 `database.rules.json`을 복원합니다.
2. 파일 내용을 다시 확인합니다.
3. 다음 명령으로 Rules만 재배포합니다.

```sh
npx firebase deploy --only database --project nchm-131bb
```

Rules를 먼저 복구하고, 그다음 프런트엔드를 이전 커밋으로 되돌리는 것이 안전합니다.

### 절대 사용하지 말아야 할 복구 명령

```sh
git reset --hard
git clean -fd
git push --force
```

정확한 대상을 모르는 상태에서 사용하면 복구할 수 없는 손실이 생길 수 있습니다.

---

## 21. 자주 발생하는 오류

### `git: command not found`

Git이 설치되지 않았거나 터미널을 다시 열지 않은 상태입니다. Git을 설치하고 터미널을 다시 시작하세요.

### `code: command not found`

VS Code의 `code` 명령이 PATH에 등록되지 않았습니다. 이 문서의 `4-1` 절차를 다시 진행하거나 VS Code의 `파일 → 폴더 열기`를 이용하세요.

### `npm: command not found`

Node.js LTS를 설치하고 터미널을 다시 여세요.

### `ENOENT: no such file or directory, package.json`

터미널이 프로젝트 폴더가 아닌 곳에 있습니다.

```sh
pwd
ls
```

목록에 `package.json`이 보이는 폴더로 이동한 뒤 다시 실행하세요.

### `EADDRINUSE` 또는 `Address already in use`

해당 포트를 다른 서버가 사용하고 있습니다. 기존 서버 터미널에서 `Control + C`를 누르거나 다른 포트를 사용하세요.

### 홈페이지가 흰 화면만 표시됨

1. HTML 파일을 Finder나 탐색기에서 직접 더블 클릭하지 않았는지 확인합니다.
2. `http://127.0.0.1:8000/...` 주소로 접속했는지 확인합니다.
3. 개발자 도구 Console의 빨간 오류를 복사합니다.
4. 터미널 서버가 종료되지 않았는지 확인합니다.

### `permission_denied`

가능한 원인:

- Firebase 인증이 완료되기 전에 요청함
- Emulator 없이 운영 Firebase에 접속함
- Rules와 저장 데이터 형식이 맞지 않음
- 관리자 계정 권한이 없음

Rules를 넓게 풀지 마세요. 오류가 발생한 경로, 인증 상태, 요청 데이터 형식을 먼저 확인해야 합니다.

AI 요청 예:

```text
permission_denied가 발생했습니다.
Rules를 전체 공개로 바꾸지 말고, 실패한 Firebase 경로와 인증 상태,
읽기 또는 쓰기 중 어느 단계에서 실패했는지 먼저 확인해 주세요.
```

### `Unable to verify client`

Firebase 또는 Google 로그인 세션, 브라우저 인증 상태, OAuth 설정 문제일 수 있습니다. 비밀번호를 코드에 입력하지 말고 Firebase Console의 프로젝트와 현재 로그인 계정을 확인하세요.

### GitHub 푸시 권한 오류

저장소 쓰기 권한이 없거나 다른 GitHub 계정으로 로그인했을 수 있습니다. 강제 푸시하지 말고 관리자에게 브랜치 푸시 권한을 요청하세요.

---

## 22. AI에게 절대 맡기면 안 되는 작업

다음 작업은 AI가 제안하더라도 담당자의 명시적인 승인 없이 실행하지 마세요.

- 운영 Firebase 데이터 삭제
- 기존 데이터 일괄 수정 또는 마이그레이션
- 관리자 인증 방식 교체
- Firebase Rules 전체 공개
- GitHub `main` 브랜치 강제 푸시
- 전체 프로젝트 전면 재작성
- 기존 필드명 삭제
- 운영 배포
- 운영 관리자 계정 생성·삭제
- `.deploy-backups` 삭제
- 알 수 없는 외부 라이브러리 추가

---

## 23. 작업 종류별 AI 요청 예시

### 글자만 변경

```text
메인 방문 등록 화면의 안내 문구만 다음 내용으로 변경해 주세요.
디자인, 저장 로직, Firebase 코드는 수정하지 마세요.
변경 파일과 위치를 알려주고 npm run check를 실행해 주세요.
운영에는 배포하지 마세요.
```

### 색상이나 간격 변경

```text
현재 디자인 구조는 유지하고 모바일 방문 등록 버튼의 위쪽 간격만 조정해 주세요.
HTML 구조와 JavaScript 동작은 바꾸지 말고 CSS 최소 범위로 수정해 주세요.
390×844와 1440×900에서 확인해 주세요.
```

### 오류 원인만 확인

```text
AR 예약 버튼을 누르면 사용자 인증 실패 문구가 표시됩니다.
실제 실행 순서와 Firebase 실패 경로를 추적해 원인만 알려주세요.
아직 코드는 수정하거나 배포하지 마세요.
```

### 오류 수정

```text
AR 예약의 인증 실패 원인을 재현한 뒤 필요한 부분만 수정해 주세요.
방문 등록 기능과 관리자 로그인 방식은 변경하지 마세요.
Firebase Rules를 넓게 완화하지 마세요.
npm run check와 npm run test:emulator를 실행하고 운영에는 배포하지 마세요.
```

### TV 화면 수정

```text
TV에서 진행 중인 일반 행사를 하나씩 순환 표시해 주세요.
이미지 행사는 전체 화면, 이미지 없는 행사는 텍스트 카드로 표시하고
어느 행사도 누락되지 않게 해 주세요.
TV 이외 기능과 Firebase 데이터 구조는 변경하지 마세요.
```

### Firebase Rules 수정

```text
현재 앱의 실제 transaction 흐름을 Emulator에서 재현한 뒤 Rules를 최소 범위로 수정해 주세요.
부모 경로 전체 읽기나 비로그인 쓰기를 허용하지 마세요.
database.rules.json과 관련 테스트만 수정하고 운영 배포는 하지 마세요.
```

---

## 24. 작업 완료 보고에서 받아야 하는 내용

AI에게 다음 내용을 빠짐없이 요청하세요.

```text
작업 완료 후 다음을 보고해 주세요.

1. 실제 원인
2. 변경한 파일
3. 파일별 변경 내용
4. 변경하지 않은 관련 기능
5. 자동 테스트 명령과 결과
6. 수동 확인 방법과 결과
7. Firebase Rules 및 데이터 변경 여부
8. 운영 배포 여부
9. 남아 있는 위험
10. 되돌리는 방법
```

`테스트 통과했습니다`라는 한 문장만 받지 말고 어떤 테스트를 몇 개 실행했고 실패가 0개인지 확인하세요.

---

## 25. 매 작업마다 사용하는 체크리스트

### 작업 전

- [ ] GPT-5.6-Sol, Low 이상을 선택했다.
- [ ] VS Code에서 올바른 프로젝트 폴더를 열었다.
- [ ] `git status`를 확인했다.
- [ ] 기존 수정 파일을 기록했다.
- [ ] `main`이 아닌 새 브랜치를 만들었다.
- [ ] 운영 배포 금지를 AI에게 명시했다.

### 작업 중

- [ ] 요청과 관계없는 파일을 수정하지 않았다.
- [ ] 관리자 비밀번호나 토큰을 입력하지 않았다.
- [ ] 실제 운영 데이터를 삭제하거나 변경하지 않았다.
- [ ] AI가 전면 재작성하지 않았는지 확인했다.

### 작업 후

- [ ] `git diff --name-only`로 변경 파일을 확인했다.
- [ ] `git diff`로 실제 변경 내용을 확인했다.
- [ ] `npm run check`가 통과했다.
- [ ] Firebase 관련 수정이면 `npm run test:emulator`가 통과했다.
- [ ] PC와 모바일 화면을 확인했다.
- [ ] TV 관련 수정이면 TV 미리보기를 확인했다.
- [ ] 필요한 파일만 `git add`했다.
- [ ] 커밋에 관련 없는 파일이 포함되지 않았다.
- [ ] 운영 배포 전 담당자 승인을 받았다.

---

## 26. 가장 짧은 작업 순서

익숙해진 뒤에는 아래 순서를 확인표처럼 사용하세요.

```sh
# 1. 프로젝트 폴더 이동
cd ~/Documents/projects/nchm_visiter

# 2. 현재 변경 확인
git status

# 3. 최신 main과 새 브랜치 준비
git switch main
git pull origin main
git switch -c fix/작업이름

# 4. VS Code 열기
code .

# 5. AI에게 수정 요청
# GPT-5.6-Sol / Low 이상 / 운영 배포 금지

# 6. 변경 확인
git status --short
git diff --name-only
git diff

# 7. 테스트
npm run check
npm run test:emulator

# 8. 필요한 파일만 선택
git add 수정파일1 수정파일2 테스트파일

# 9. 커밋 확인 및 생성
git diff --cached
git commit -m "수정 내용"

# 10. 작업 브랜치 푸시
git push -u origin fix/작업이름
```

`npm run test:emulator`는 Firebase와 무관한 단순 문구·스타일 변경에서는 생략할 수 있지만, 인증·저장·예약·Rules 관련 작업에서는 반드시 실행하세요.

---

## 27. 담당자에게 확인해야 하는 정보

처음 인수인계받을 때 다음 내용을 별도로 확인해 두세요.

- GitHub 저장소 쓰기 권한이 있는 계정
- PR 승인 담당자
- 실제 프런트엔드 배포 서비스와 배포 방법
- Firebase 프로젝트 접근 권한
- Firebase Rules 배포 승인 담당자
- 장애 발생 시 연락할 사람
- 운영 배포 가능 시간
- 운영 테스트 데이터 사용 기준
- 롤백 판단 기준

현재 저장소만으로는 프런트엔드의 실제 운영 배포 방법을 확정할 수 없습니다. 이 정보가 확인되지 않았다면 로컬 수정과 브랜치 푸시까지만 진행하세요.

---

## 마지막으로

AI는 코드를 빠르게 찾고 수정할 수 있지만, 운영 데이터와 배포 결과에 대한 책임까지 자동으로 판단해 주지는 않습니다.

항상 다음 순서를 지키면 큰 사고를 줄일 수 있습니다.

```text
현재 상태 확인
→ 새 브랜치 생성
→ 최소 범위 수정
→ 변경 파일 확인
→ 자동 테스트
→ 화면 수동 확인
→ 필요한 파일만 커밋
→ 담당자 검토
→ 승인 후 배포
```

조금이라도 이상하면 배포하지 말고 멈춘 뒤 오류 화면과 `git status` 결과를 담당자에게 전달하세요.
