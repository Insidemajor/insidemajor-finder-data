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

/**
 * 중복 제거 함수
 */
function uniqueArray(arr) {
  if (!Array.isArray(arr)) return null;
  return [...new Set(arr)].filter(Boolean);
}

async function fetchScorecardData(programTitle = '') {
  if (!API_KEY) {
    console.error('Error: COLLEGE_SCORECARD_API_KEY is not set.');
    process.exit(1);
  }

  let existingData = [];
  if (fs.existsSync(OUTPUT_PATH)) {
    try {
      existingData = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf-8'));
    } catch (e) {
      console.warn('Failed to parse existing data file, starting fresh.');
      existingData = [];
    }
  }

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

  const perPage = 100;
  let page = lastPage + 1;
  let hasMore = true;
  let newData = [];
  const maxRetries = 3;
  const SAVE_INTERVAL = 10;

  const fields = [
    'id',
    'school.name',
    'school.city',
    'school.state',
    'school.ownership',
    'school.school_url',
    'school.carnegie_basic',
    'school.locale',
    'latest.academics.programs',
    'latest.academics.program_percentage',
    'latest.student.size',
    'latest.completion.rate',
    'latest.earnings.10_yrs_after_entry.median',
    'latest.admissions.admission_rate.overall',
    'latest.cost.tuition.in_state',
    'latest.cost.tuition.out_of_state',
    'latest.cost.attendance.academic_year',
    'latest.aid.median_debt.completers',
  ].join(',');

  while (hasMore) {
    let retries = maxRetries;
    let data;

    const filterParams = [];
    if (programTitle.trim()) {
      // 간소화된 필터링 구문, API 테스트 후 필요시 조정하세요
      filterParams.push(`latest.academics.programs.title ilike '%${programTitle}%'`);
    }
    const filterQuery = filterParams.length > 0 ? `&${filterParams.join(' AND ')}` : '';

    while (true) {
      try {
        const url = `${API_URL}?api_key=${API_KEY}&fields=${fields}&per_page=${perPage}&page=${page}${filterQuery}`;
        const response = await fetch(url);

        if (!response.ok) {
          retries--;
          if (retries <= 0) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          console.warn(`Failed to fetch page ${page}, retrying... (${maxRetries - retries}/${maxRetries})`);
          await delay(500);
          continue;
        }

        data = await response.json();
        break;
      } catch (err) {
        console.error('Fetch error:', err.message);
        process.exit(1);
      }
    }

    if (!data.results || data.results.length === 0) {
      hasMore = false;
      break;
    }

    newData = newData.concat(
      data.results.map((item, index) => {
        const programs = item.latest?.academics?.programs || [];
        return {
          number: newData.length + index + 1,
          id: item.id,
          name: item['school.name'] ?? null,
          city: item['school.city'] ?? null,
          state: item['school.state'] ?? null,
          ownership: item['school.ownership'] ?? null,
          school_url: item['school.school_url'] ?? null,
          carnegie_basic: item['school.carnegie_basic'] ?? null,
          locale: item['school.locale'] ?? null,
          program_titles: uniqueArray(programs.map(p => p.title)),
          program_percentage: item['latest.academics.program_percentage'] ?? null,
          degree_levels: uniqueArray(programs.map(p => p.degree_level)),
          cip_4_digits: uniqueArray(programs.map(p => p.cip_4_digit_code)),
          cip_6_digits: uniqueArray(programs.map(p => p.cip_6_digit_code)),
          size: item.latest?.student?.size ?? null,
          completion_rate: item.latest?.completion?.rate ?? null,
          earnings_10yr_median: item.latest?.earnings?.['10_yrs_after_entry']?.median ?? null,
          admission_rate: item.latest?.admissions?.admission_rate?.overall ?? null,
          tuition_in_state: item.latest?.cost?.tuition?.in_state ?? null,
          tuition_out_of_state: item.latest?.cost?.tuition?.out_of_state ?? null,
          attendance_academic_year: item.latest?.cost?.attendance?.academic_year ?? null,
          median_debt_completers: item.latest?.aid?.median_debt?.completers ?? null,
        };
      })
    );

    // 중간 저장 및 기존 데이터 병합, 삭제 처리
    if (page % SAVE_INTERVAL === 0 || page * perPage >= data.metadata.total) {
      const existingMap = new Map(existingData.map(item => [item.id, item]));
      const newMap = new Map(newData.map(item => [item.id, item]));

      newMap.forEach((newItem, id) => existingMap.set(id, newItem));
      for (const id of existingMap.keys()) {
        if (!newMap.has(id)) {
          existingMap.delete(id);
        }
      }

      const updatedData = Array.from(existingMap.values());
      fs.writeFileSync(OUTPUT_PATH, JSON.stringify(updatedData, null, 2));
      console.log(`Intermediate save at page ${page}, total records saved: ${updatedData.length}`);

      // 메모리 절약 및 설계 편의상 초기화
      existingData = updatedData;
      newData = [];

      fs.writeFileSync(STATE_PATH, JSON.stringify({ lastPage: page }, null, 2));
    }

    if (page * perPage >= data.metadata.total) {
      hasMore = false;
    } else {
      page++;
      await delay(200);
    }
  }

  // 최종 병합 및 저장
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
  if (fs.existsSync(STATE_PATH)) {
    fs.unlinkSync(STATE_PATH);
  }
  console.log(`Delta update complete. Data saved. Total changes: ${changesCount}`);
}

// 사용 예시: 필터 전공명을 전달
fetchScorecardData('Computer Science').catch(err => {
  console.error('Fetch error:', err.message);
  process.exit(1);
});
