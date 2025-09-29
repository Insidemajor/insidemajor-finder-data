name: Fetch Scorecard Data  # 워크플로 이름

on:
  schedule:
    - cron: '0 3 * * 0'      # 매주 일요일 오전 3시 UTC에 실행
  workflow_dispatch:         # 수동 실행 가능

jobs:
  fetch-data:
    runs-on: ubuntu-latest    # 최신 우분투 서버에서 실행
    timeout-minutes: 30       # 30분 제한 시간

    steps:
      - name: Checkout repo
        uses: actions/checkout@v4  # 최신 v4로 체크아웃 액션 사용
        with:
          token: ${{ secrets.GITHUB_TOKEN }}  # 권한 토큰
          fetch-depth: 0                    # 전체 커밋 기록 가져오기

      - name: Set up Node.js
        uses: actions/setup-node@v4      # Node.js v4 액션 사용
        with:
          node-version: '18'               # Node.js 버전을 18로 지정
          cache: 'npm'                    # npm 캐시 기능 사용 (속도 개선)
          # cache-dependency-path 제거하여 npm이 자동 감지

      - name: Install dependencies
        run: npm ci                     # 락파일 기반 의존성 설치 (npm install 보다 안정적)
        working-directory: ./scripts    # 스크립트 경로에서 실행

      - name: Create data directory
        run: mkdir -p ../data           # data 폴더 없으면 생성
        working-directory: ./scripts

      - name: Run fetch-api script
        env:
          COLLEGE_SCORECARD_API_KEY: ${{ secrets.COLLEGE_SCORECARD_API_KEY }}  # API 키 환경변수 주입
        run: |
          echo "Starting data fetch..."  # 시작 메시지 출력
          node fetch-api.js              # Node.js 실행 스크립트
        working-directory: ./scripts

      - name: Commit and push updated data
        run: |
          # Git 사용자 정보 설정
          git config --global user.name 'github-actions[bot]'
          git config --global user.email '41898282+github-actions[bot]@users.noreply.github.com'

          # 변경사항 있는지 검사 후 처리
          if [ -n "$(git status --porcelain)" ]; then
            git add data/filtered_data.json                     # 데이터 파일 스테이지에 추가
            git commit -m "Update filtered data - $(date -u +'%Y-%m-%d %H:%M:%S UTC')"  # 커밋 메시지에 UTC 타임스탬프 포함
            git push                                           # 원격 저장소에 푸시
            echo "✅ Data updated and pushed successfully"     # 성공 메시지 출력
          else
            echo "ℹ️  No changes detected, skipping commit"    # 변경 없음 안내
          fi
