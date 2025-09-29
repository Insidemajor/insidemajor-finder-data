name: Fetch Scorecard Data  // 워크플로이름

on:
  schedule:
    - cron: '0 3 * * 0'      // 매주일요일오전3시UTC에실행
  workflow_dispatch:         // 수동실행가능

jobs:
  fetch-data:
    runs-on: ubuntu-latest    // 최신우분투서버에서실행
    timeout-minutes: 30       // 제한시간

    steps:
      - name: Checkout repo
        uses: actions/checkout@v4  // 최신v4체크아웃액션사용
        with:
          token: ${{ secrets.GITHUB_TOKEN }}  // 권한토큰
          fetch-depth: 0                    // 전체커밋기록가져오기

      - name: Set up Node.js
        uses: actions/setup-node@v4      // Node.jsv4액션사용
        with:
          node-version: '18'               // Node.js버전을18로지정
          cache: 'npm'                    // npm캐시기능사용속도개선

      - name: Install dependencies
        run: npm ci                     // 락파일기반의존성설치
        working-directory: ./scripts    // 스크립트경로에서실행

      - name: Create data directory
        run: mkdir -p ../data           // data폴더없으면생성
        working-directory: ./scripts

      - name: Run fetch-api script
        env:
          COLLEGE_SCORECARD_API_KEY: ${{ secrets.COLLEGE_SCORECARD_API_KEY }}  // API키환경변수주입
        run: |
          echo "Starting data fetch..."  // 시작메시지출력
          node fetch-api.js              // 실행스크립트
        working-directory: ./scripts

      - name: Commit and push updated data
        run: |
          // Git사용자정보설정
          git config --global user.name 'github-actions[bot]'
          git config --global user.email '41898282+github-actions[bot]@users.noreply.github.com'

          // 변경사항있는지검사후처리
          if [ -n "$(git status --porcelain)" ]; then
            git add data/filtered_data.json                     // 데이터파_
