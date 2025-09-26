const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.COLLEGE_SCORECARD_API_KEY;
const API_URL = 'https://api.data.gov/ed/collegescorecard/v1/schools';
const OUTPUT_PATH = path.resolve(__dirname, '../data/filtered_data.json');

async function fetchScorecardData() {
  if (!API_KEY) {
    console.error('Error: COLLEGE_SCORECARD_API_KEY is not set.');
    process.exit(1);
  }
  try {
    // API 호출, 페이징으로 1회당 100개 호출
const perPage = 100;
let page = 1;
let allResults = [];
let hasMore = true;

while (hasMore) {
  const fields = [
  'id',
  'school.name',
  'school.city',
  'school.state',
  'school.school_url',
  'school.carnegie_basic',
  'school.locale',
  'latest.academics.programs.title',
  'latest.academics.program_percentage',
  'latest.academics.programs.degree_level',
  'latest.student.size',
  'latest.completion.rate',
  'latest.cost.tuition.in_state',
  'latest.cost.tuition.out_of_state',
  'latest.cost.attendance.academic_year',
  'latest.aid.median_debt.completers',
].join(',');
  const response = await fetch(`${API_URL}?api_key=${API_KEY}&fields=${fields}&per_page=${perPage}&page=${page}`);

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();

  if (data.results.length === 0) {
    hasMore = false;
    break;
  }

  allResults = allResults.concat(data.results.map((item, index) => ({
  number: allResults.length + index + 1,
  id: item.id,
  name: item['school.name'] ?? null,
  city: item['school.city'] ?? null,
  state: item['school.state'] ?? null,
  school_url: item['school.school_url'] ?? null,
  carnegie_basic: item['school.carnegie_basic'] ?? null,
  locale: item['school.locale'] ?? null,
  program_title: item['latest.academics.programs.title'] ?? null,
  program_percentage: item['latest.academics.program_percentage'] ?? null,
  degree_level: item['latest.academics.programs.degree_level'] ?? null,
  size: item.latest?.student?.size ?? null,
  completion_rate: item.latest?.completion?.rate ?? null,
  tuition_in_state: item.latest?.cost?.tuition?.in_state ?? null,
  tuition_out_of_state: item.latest?.cost?.tuition?.out_of_state ?? null,
  attendance_academic_year: item.latest?.cost?.attendance?.academic_year ?? null,
  median_debt_completers: item.latest?.aid?.median_debt?.completers ?? null,
    
  })));

  page++;

  if (data.metadata && data.metadata.total < perPage * (page + 1)) {
    hasMore = false;
  }
}

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(allResults, null, 2));
console.log('Filtered data saved to:', OUTPUT_PATH);

} catch (err) {
  console.error('Fetch error:', err.message);
  process.exit(1);
  }
}
fetchScorecardData();
