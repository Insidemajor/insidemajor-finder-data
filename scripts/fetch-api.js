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
    const response = await fetch(`${API_URL}?api_key=${API_KEY}&fields=id,school.name,latest.student.size&per_page=10`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    const filteredData = data.results.map(item => ({
      id: item.id,
      name: item['school.name'],
      size: item.latest.student.size,
    }));
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(filteredData, null, 2));
    console.log('Filtered data saved to:', OUTPUT_PATH);
  } catch (err) {
    console.error('Fetch error:', err.message);
    process.exit(1);
  }
}

fetchScorecardData();
