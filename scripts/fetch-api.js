const fs = require('fs');
const path = require('path');

// Use built-in fetch for Node.js 18+
const fetch = globalThis.fetch || require('node-fetch');

const API_KEY = process.env.COLLEGE_SCORECARD_API_KEY;
const API_URL = 'https://api.data.gov/ed/collegescorecard/v1/schools';

// Ensure data directory exists
const DATA_DIR = path.resolve(__dirname, '../data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const OUTPUT_PATH = path.join(DATA_DIR, 'filtered_data.json');

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, maxRetries = 5) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Fetching data (attempt ${attempt}/${maxRetries})...`);
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'College-Scorecard-Fetcher/1.0',
          'Accept': 'application/json'
        },
        timeout: 30000
      });
      
      if (response.status === 429) {
        const waitTime = Math.min(Math.pow(2, attempt) * 1000, 60000);
        console.log(`Rate limited. Waiting ${waitTime}ms before retry...`);
        await delay(waitTime);
        continue;
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`API Error Response: ${errorText}`);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error.message);
      if (attempt === maxRetries) throw error;
      await delay(2000 * attempt);
    }
  }
}

async function fetchScorecardData() {
  if (!API_KEY) {
    console.error('Error: COLLEGE_SCORECARD_API_KEY is not set.');
    process.exit(1);
  }

  console.log('Starting College Scorecard data fetch...');
  
  let allData = [];
  let page = 1;
  let hasMore = true;
  const MAX_PAGES = 50;

  // FIXED: Corrected field names that actually exist in the API
  const fields = [
    'id',
    'school.name',
    'school.city',
    'school.state',
    'school.ownership',
    'school.school_url',
    'latest.student.size',
    'latest.completion.completion_rate_4yr_100nt',
    'latest.earnings.10_yrs_after_entry.median',
    'latest.admissions.admission_rate.overall',
    'latest.cost.tuition.in_state',
    'latest.cost.tuition.out_of_state'
  ].join(',');

  try {
    while (hasMore && page <= MAX_PAGES) {
      // FIXED: Removed problematic program filter that was causing 400 errors
      const url = `${API_URL}?api_key=${API_KEY}&fields=${fields}&per_page=100&page=${page}&school.degrees_awarded.predominant=2,3&latest.student.size__gt=0`;
      
      console.log(`Fetching page ${page}...`);
      const data = await fetchWithRetry(url);

      if (!data.results || data.results.length === 0) {
        console.log('No more data available');
        hasMore = false;
        break;
      }

      const processedResults = data.results
        .filter(item => item && item.id)
        .map(item => ({
          id: item.id,
          name: item['school.name'] || 'Unknown',
          city: item['school.city'] || null,
          state: item['school.state'] || null,
          ownership: item['school.ownership'] || null,
          school_url: item['school.school_url'] || null,
          size: item.latest?.student?.size || null,
          completion_rate: item.latest?.completion?.completion_rate_4yr_100nt || null,
          earnings_10yr_median: item.latest?.earnings?.['10_yrs_after_entry']?.median || null,
          admission_rate: item.latest?.admissions?.admission_rate?.overall || null,
          tuition_in_state: item.latest?.cost?.tuition?.in_state || null,
          tuition_out_of_state: item.latest?.cost?.tuition?.out_of_state || null,
          last_updated: new Date().toISOString()
        }));

      allData = allData.concat(processedResults);
      console.log(`Processed page ${page}: ${processedResults.length} records (Total: ${allData.length})`);

      if (data.metadata && page * 100 >= data.metadata.total) {
        hasMore = false;
      }

      page++;
      await delay(1000); // Respectful rate limiting
    }

    // Remove duplicates and save
    const uniqueData = Array.from(
      new Map(allData.map(item => [item.id, item])).values()
    ).sort((a, b) => a.id - b.id);

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(uniqueData, null, 2));
    console.log(`✅ Data fetch completed! Total records: ${uniqueData.length}`);

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

console.log('🚀 Starting College Scorecard data fetcher...');
fetchScorecardData();
