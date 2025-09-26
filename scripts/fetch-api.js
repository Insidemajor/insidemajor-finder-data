const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.COLLEGE_SCORECARD_API_KEY;
const API_URL = 'https://api.data.gov/ed/collegescorecard/v1/schools';
const OUTPUT_PATH = path.resolve(__dirname, '../data/filtered_data.json');
const STATE_PATH = path.resolve(__dirname, '../data/fetch_state.json');

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchScorecardData() {
  if (!API_KEY) {
    console.error('Error: COLLEGE_SCORECARD_API_KEY is not set.');
    process.exit(1);
  }

  // 1. 기존 JSON 파일 불러오기
  let existingData = [];
  if (fs.existsSync(OUTPUT_PATH)) {
    existingData = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf-8'));
  }

  // 1-1. 저장된 진행 상태 불러오기 (재시작용)
  let lastPage = 0;
  if (fs.existsSync(STATE_PATH)) {
    try {
      const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8'));
      lastPage = state.lastPage || 0;
      console.log(`Resuming from page ${lastPage + 1}`);
    } catch {
      console.warn('Failed to load fetch state. Starting from page 1.');
    }
  }

  // 2. API 호출 및 데이터 수집 (페이징 반복)
  const perPage = 100;
  let page = lastPage + 1; // 재시작 시 마지막 페이지 이후부터 시작
  let hasMore = true;
  let newData = [];
  const maxRetries = 3;
  const SAVE_INTERVAL = 10;

  const fields = [
    'id',
    'school.name',
    'school.city',
    'school.state',
    'school.school_url',
    'school.carnegie_basic',
    'school.locale',
    'latest.academics.programs',
    'latest.academics.program_percentage',
    'latest.student.size',
    'latest.completion.rate',
    'latest.cost.tuition.in_state',
    'latest.cost.tuition.out_of_state',
    'latest.cost.attendance.academic_year',
    'latest.aid.median_debt.completers',
  ].join(',');

  while (hasMore) {
    let retries = maxRetries;
    let data;

    while (true) {
      const response = await fetch(`${API_URL}?api_key=${API_KEY}&fields=${fields}&per_page=${perPage}&page=${page}`);

      if (response.ok) {
        data = await response.json();
        break;
      } else {
        retries--;
        if (retries <= 0) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        console.warn(`Failed to fetch page ${page}, retrying... (${maxRetries - retries}/${maxRetries})`);
        await delay(500);
      }
    }

    if (data.results.length === 0) {
      hasMore = false;
      break;
    }

    newData = newData.concat(
      data.results.map((item, index) => ({
        number: newData.length + index + 1,
        id: item.id,
        name: item['school.name'] ?? null,
        city: item['school.city'] ?? null,
        state: item['school.state'] ?? null,
        school_url: item['school.school_url'] ?? null,
        carnegie_basic: item['school.carnegie_basic'] ?? null,
        locale: item['school.locale'] ?? null,
        program_title: item.latest?.academics?.programs?.[0]?.title ?? null,
        program_percentage: item['latest.academics.program_percentage'] ?? null,
        degree_level: item.latest?.academics?.programs?.[0]?.degree_level ?? null,
        size: item.latest?.student?.size ?? null,
        completion_rate: item.latest?.completion?.rate ?? null,
        tuition_in_state: item.latest?.cost?.tuition?.in_state ?? null,
        tuition_out_of_state: item.latest?.cost?.tuition?.out_of_state ?? null,
        attendance_academic_year: item.latest?.cost?.attendance?.academic_year ?? null,
        median_debt_completers: item.latest?.aid?.median_debt?.completers ?? null,
      }))
    );

    if (page % SAVE_INTERVAL === 0 || page * perPage >= data.metadata.total) {
      // 중간 델타 병합 및 저장 (신규, 수정, 삭제 반영)
      const existingMap = new Map(existingData.map(item => [item.id, item]));
      const newMap = new Map(newData.map(item => [item.id, item]));

      // 신규, 수정, 삭제 모두 처리
      newMap.forEach((newItem, id) => {
        existingMap.set(id, newItem);
      });
      for (const id of existingMap.keys()) {
        if (!newMap.has(id)) {
          existingMap.delete(id);
        }
      }

      const updatedData = Array.from(existingMap.values());
      fs.writeFileSync(OUTPUT_PATH, JSON.stringify(updatedData, null, 2));
      console.log(`Intermediate save at page ${page}, total records saved: ${updatedData.length}`);

      existingData = updatedData;
      newData = [];  // 메모리 절약을 위해 중간 누적 초기화

      // 진행 상태 저장 (재시작용)
      fs.writeFileSync(STATE_PATH, JSON.stringify({ lastPage: page }, null, 2));
    }

    if (page * perPage >= data.metadata.total) {
      hasMore = false;
    } else {
      page++;
      await delay(200);
    }
  }

  // 최종 델타 업데이트 병합 및 저장
  const existingMap = new Map(existingData.map(item => [item.id, item]));
  const newMap = new Map(newData.map(item => [item.id, item]));

  let changesCount = 0;

  newMap.forEach((newItem, id) => {
    if (!existingMap.has(id) || JSON.stringify(existingMap.get(id)) !== JSON.stringify(newItem)) {
      existingMap.set(id, newItem);
      changesCount++;
    }
  });

  for (const id of existingMap.keys()) {
    if (!newMap.has(id)) {
      existingMap.delete(id);
      changesCount++;
    }
  }

  const updatedData = Array.from(existingMap.values());
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(updatedData, null, 2));
  // 마지막으로 진행 상태 파일 삭제해 완료 표시
  if (fs.existsSync(STATE_PATH)) {
    fs.unlinkSync(STATE_PATH);
  }
  console.log(`Delta update complete. Data saved. Total changes: ${changesCount}`);
}

fetchScorecardData().catch(err => {
  console.error('Fetch error:', err.message);
  process.exit(1);
});
