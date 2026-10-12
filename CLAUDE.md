# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 현재 상태

아직 코드가 없다. 저장소에는 기획 문서 두 개만 있다. 작업 전에 먼저 읽을 것.

- `PRD.md` — 무엇을 만드는지 (골목카페 운영 대시보드, 페이지 5개)
- `STEPS.md` — 만드는 순서. `index.html` 틀부터 한 페이지씩 만들고 단계마다 확인한다.

빌드·린트·테스트 명령은 없다. npm과 빌드 도구를 쓰지 않는 것이 요구사항이다. HTML 파일을 브라우저에서 바로 열어 확인한다.

## 구조 (계획)

- 페이지마다 HTML 파일 하나: `index.html`(틀), `sales.html`, `menu.html`, `reviews.html`, `promo.html`.
- `index.html`은 왼쪽 메뉴와 가운데 `iframe`으로 이루어진 틀이다. 나머지 페이지는 이 iframe 안에서 열리므로 각 페이지는 단독으로도, iframe 안에서도 동작해야 한다. 홈 화면의 숫자 카드·7일 매출 그래프도 `index.html`이 보여 준다.
- 파일을 나눠 쓰는 공통 코드가 없으므로 모든 페이지의 색과 글꼴을 똑같이 맞춰야 한다. 색·글꼴 값을 바꾸면 5개 페이지를 모두 고친다.
- DB는 사장님 본인의 Supabase 프로젝트이고, 페이지에서 직접 조회·저장한다. 테이블은 `menus`, `sales`, `reviews` 초안이며 만들 때 확정한다.
- AI 기능(리뷰 답글, 홍보 문구)은 Supabase Edge Function `cafe-ai` 하나가 모두 처리한다. AI 키는 Edge Function 쪽에만 두고 HTML에는 넣지 않는다.

## 작업 규칙

- 사용자 요청 없이 커밋·push 하지 않는다. 원격 `origin`은 `https://github.com/computerilsans2-a11y/day8-cafe`로 연결되어 있다.
- 사용자는 비개발자(카페 사장님)이므로 설명은 쉬운 한국어로 한다.
