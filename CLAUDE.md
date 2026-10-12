# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 현재 상태

골목카페 운영 대시보드(페이지 5개)가 동작한다. 기획은 `PRD.md`, 만든 순서는 `STEPS.md`에 있다.
빌드·린트·테스트 명령은 없다. npm과 빌드 도구를 쓰지 않는 것이 요구사항이다.

## 실행

로컬 서버로 열어 확인한다. `.claude/launch.json`의 `cafe-dashboard`가 `tools/serve.ps1`(PowerShell 서버, 포트 5173)을 띄운다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/serve.ps1
```

이 PC에는 Python/Node가 없다. `index.html`을 더블클릭해 열어도 메뉴 전환은 되지만, 판매·AI 등 Supabase 호출은 서버로 열었을 때를 기준으로 확인한다.

## 구조

- 페이지마다 HTML 파일 하나, CSS와 JS는 파일 안에 둔다: `index.html`(틀 + 홈), `sales.html`, `menu.html`, `reviews.html`, `promo.html`.
- `index.html`은 232px 왼쪽 메뉴와 가운데 영역이다. 홈 화면(숫자 카드 4개, 7일 매출 그래프, 오늘 브리핑)은 `index.html`이 직접 그리고, 나머지 4개는 `iframe`으로 연다. 각 페이지는 단독으로도 열려야 한다.
- 왼쪽 메뉴의 "AI 모델" 선택은 `localStorage`의 `cafe-ai-model`에 저장되고, `reviews.html`·`promo.html`이 AI를 부를 때 읽어서 `model`로 보낸다. 기본값은 `google/gemma-4-31b-it:free`이며 세 파일이 같은 값을 써야 한다.
- DB는 Supabase 프로젝트 `day8-cafe`(`menus`, `sales`, `reviews`). 페이지가 공개용 키로 REST를 직접 부른다. 모든 테이블에 로그인 없이 읽고 쓰는 RLS 정책이 열려 있다. 판매 입력은 `record_sale(p_menu_id, p_quantity)` 함수가 판매 기록과 재고 차감을 한 번에 처리한다.
- AI는 Edge Function `cafe-ai`(`supabase/functions/cafe-ai/index.ts`, verify_jwt 꺼짐) 하나가 `type`으로 review / promo / brief를 처리한다. OpenRouter 키는 Secrets의 `OPENROUTER_API_KEY`에서만 읽는다. 함수를 고치면 이 파일을 고친 뒤 같은 내용으로 다시 배포해야 화면에 반영된다.

## 저장소에 없는 것

- **DB 구조(테이블, RLS 정책, 테이블 권한 GRANT, `record_sale` 함수)는 저장소에 SQL 파일이 없다.** Supabase 프로젝트(`aygdylhsmzevjrybnozf`)에만 있으므로 구조를 바꾸거나 새 환경을 만들 때는 거기서 직접 확인한다. RLS 정책만으로는 부족하고 `anon`에 GRANT도 있어야 공개용 키로 읽고 쓸 수 있다.
- OpenRouter 키는 Supabase Secrets에만 있다.

## AI 호출 주의

- 모델은 무료 모델이라 짧은 시간에 여러 번 부르면 429(요청 제한)가 난다. 테스트할 때는 호출 사이에 20~40초 쉰다. 함수는 429를 만나면 한 번 다시 시도하고, 그래도 안 되면 다른 모델로 넘어간다.
- `nemotron` 계열은 추론 모델이라 답변 전에 토큰을 쓴다. `max_tokens`를 줄이면 빈 응답이 나온다.
- 화면에서 AI를 부르는 곳은 세 곳이다: `index.html`(brief), `reviews.html`(review), `promo.html`(promo). 응답 형식을 바꾸면 함수의 `validate`와 세 화면의 확인 코드를 같이 고친다.

## 서브에이전트

`.claude/agents/code-reviewer.md`: 읽기 전용(Read, Grep, Glob) 코드 리뷰어. 에이전트 파일은 세션 시작 때 읽으므로, 파일을 만들기 전에 시작한 세션에서는 목록에 보이지 않는다.

## 여러 파일에 같은 값이 복사되어 있다

공통 파일이 없어서 아래 값은 바꿀 때 해당 파일을 모두 고쳐야 한다.

- Supabase 주소와 공개용 키: 5개 HTML 파일
- 디자인 값(`:root`의 색·글꼴): 5개 HTML 파일
- `friendly()`(오류를 쉬운 문장으로 바꾸는 함수): 5개 HTML 파일
- 재고 부족 기준(5개 이하): `index.html`, `menu.html`
- "오늘" 기준은 한국 시간(UTC+9) 고정이다. `index.html`과 `sales.html`의 `kstDayKey`가 같은 방식이어야 홈과 매출 숫자가 맞는다.
- AI 모델 목록: `index.html` 선택 메뉴와 `cafe-ai`의 `MODELS`

## 디자인 규칙

모든 페이지가 같은 디자인을 쓴다. (참고 명세: 사용자가 제공한 `greeting.md`의 시각 처리)

- 흰 바탕, 구획은 1px 얇은 선. 카드에 그림자를 쓰지 않는다. 라운드는 4·6·8px만 쓴다.
- 회색은 검정 투명도(4%, 6%, 11%, 18%, 45%, 60%, 85%)로만 쓴다. 강조색은 파랑(`#1890ff`) 하나이고 버튼과 현재 메뉴에만 쓴다. 위험·부족 표시는 빨강(`#f5222d`).
- 글꼴은 Pretendard 우선, 굵기는 400과 600만 쓴다. 이모지는 쓰지 않는다.
- hover에 투명도를, 눌렀을 때 축소를, focus에 바깥 링을 쓰지 않는다. focus는 테두리를 파랑으로 바꾼다.
- 화면 문구는 존댓말 `-습니다` / `-해 주세요`. 오류는 "무슨 일이 생겼는지 + 다음에 할 일" 순서로, 기술 용어·JSON·영문을 그대로 보여 주지 않는다.

## 작업 규칙

- 사용자 요청 없이 커밋·push 하지 않는다. 원격 `origin`은 `https://github.com/computerilsans2-a11y/day8-cafe`이다.
- 사용자는 비개발자(카페 사장님)이므로 설명은 쉬운 한국어로 한다.
- DB 구조를 바꾸면 사용자에게 알린다. 샘플 데이터는 테스트가 끝나면 원래대로 되돌린다.
