name: Fetch Scorecard Data

on:
  schedule:
    - cron: '0 3 * * 0'  # Weekly on Sunday at 3 AM UTC
  workflow_dispatch:

jobs:
  fetch-data:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    
    steps:
      - name: Checkout repo
        uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          fetch-depth: 0

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
          # Removed cache-dependency-path to let npm auto-detect

      - name: Install dependencies
        run: npm ci
        working-directory: ./scripts

      - name: Create data directory
        run: mkdir -p ../data
        working-directory: ./scripts

      - name: Run fetch-api script
        env:
          COLLEGE_SCORECARD_API_KEY: ${{ secrets.COLLEGE_SCORECARD_API_KEY }}
        run: |
          echo "Starting data fetch..."
          node fetch-api.js
        working-directory: ./scripts

      - name: Commit and push updated data
        run: |
          git config --global user.name 'github-actions[bot]'
          git config --global user.email '41898282+github-actions[bot]@users.noreply.github.com'
          
          # Check for changes and commit
          if [ -n "$(git status --porcelain)" ]; then
            git add data/filtered_data.json
            git commit -m "Update filtered data - $(date -u +'%Y-%m-%d %H:%M:%S UTC')"
            git push
            echo "✅ Data updated and pushed successfully"
          else
            echo "ℹ️  No changes detected, skipping commit"
          fi
