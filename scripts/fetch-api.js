name: Fetch Scorecard Data

on:
  schedule:
    - cron: '0 3 * * 0'  # 매주 일요일 03:00 UTC (서울 12:00)
  workflow_dispatch:

jobs:
  fetch-data:
    runs-on: ubuntu-latest

    steps:
    - name: Checkout repo
      uses: actions/checkout@v3

    - name: Set up Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'

    - name: Install dependencies
      run: npm install
      working-directory: ./scripts

    - name: Run fetch-api script
      env:
        COLLEGE_SCORECARD_API_KEY: ${{ secrets.COLLEGE_SCORECARD_API_KEY }}
      run: node fetch-api.js
      working-directory: ./scripts

    - name: Commit and push updated data
      run: |
        git config --global user.name "github-actions"
        git config --global user.email "actions@github.com"
        git add ../data/filtered_data.json
        git commit -m "Update filtered data"
        git push
      working-directory: ./scripts
      continue-on-error: true
