const fs = require('fs');
const path = require('path');

// Use built-in fetch for Node.js 18+ or fallback to node-fetch
const fetch = globalThis.fetch || require('node-fetch');

const API_KEY = process.env.COLLEGE_SCORECARD_API_KEY;
const API_URL = 'https://api.data.gov/ed/collegescorecard/v1/schools';

// Ensure data directory exists
const DATA_DIR = path.resolve(__dirname, '../data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log('Created data directory:', DATA_DIR);
}

const OUTPUT_PATH = path.join(DATA_DIR, 'filtered_data.json');

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function uniqueArray(arr) {
  if (!Array.isArray(arr)) return null;
  return [...new Set(arr)].filter(Boolean);
}

async function fetchWithRetry(url, maxRetries = 5) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`📡 Fetching data (attempt ${attempt}/${maxRetries})...`);
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'College-Scorecard-Fetcher/2.0',
          'Accept': 'application/json'
        },
        timeout: 30000
      });
      
      // Handle rate limiting
      if (response.status === 429) {
        const waitTime = Math.min(Math.pow(2, attempt) * 1000, 60000);
        console.log(`⏳ Rate limited. Waiting ${waitTime}ms before retry...`);
        await delay(waitTime);
        continue;
      }
      
      // Handle HTTP errors
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error(`❌ API Error Response: ${errorText}`);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('✅ Successfully fetched data from API');
      return data;
      
    } catch (error) {
      console.error(`❌ Attempt ${attempt} failed:`, error.message);
      if (attempt === maxRetries) {
        throw new Error(`Failed after ${maxRetries} attempts: ${error.message}`);
      }
      await delay(2000 * attempt); // Progressive delay
    }
  }
}

async function fetchScorecardData() {
  if (!API_KEY) {
    console.error('❌ Error: COLLEGE_SCORECARD_API_KEY is not set.');
    process.exit(1);
  }

  console.log('🚀 Starting College Scorecard data fetch...');
  console.log(`🔑 API Key configured: ${API_KEY.length} characters`);
  
  // Load existing data
  let existingData = [];
  if (fs.existsSync(OUTPUT_PATH)) {
    try {
      existingData = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf-8'));
      console.log(`📂 Loaded ${existingData.length} existing records`);
    } catch (e) {
      console.warn('⚠️  Failed to parse existing data, starting fresh.');
      existingData = [];
    }
  }

  let allData = [];
  let page = 1;
  let hasMore = true;
  const MAX_PAGES = 100; // Safety limit

  // FIXED: Use only verified API field names that actually exist
  const fields = [
    'id',
    'school.name',
    'school.city',
    'school.state', 
    'school.ownership',
    'school.school_url',
    'school.carnegie_basic',
    'school.locale',
    'latest.student.size',
    'latest.completion.completion_rate_4yr_100nt',
    'latest.earnings.10_yrs_after_entry.median',
    'latest.admissions.admission_rate.overall',
    'latest.cost.tuition.in_state',
    'latest.cost.tuition.out_of_state',
    'latest.cost.attendance.academic_year'
  ].join(',');

  try {
    while (hasMore && page <= MAX_PAGES) {
      // FIXED: Removed the problematic program filter that was causing 400 errors
      // Only use basic, reliable filters that are guaranteed to work
      const url = `${API_URL}?api_key=${API_KEY}&fields=${fields}&per_page=100&page=${page}&school.degrees_awarded.predominant=2,3&latest.student.size__gt=0&school.operating=1`;
      
      console.log(`📄 Fetching page ${page}...`);
      const data = await fetchWithRetry(url);

      if (!data.results || data.results.length === 0) {
        console.log('📭 No more data available');
        hasMore = false;
        break;
      }

      // Process results with better error handling
      const processedResults = data.results
        .filter(item => item && item.id) // Filter out invalid records
        .map(item => {
          try {
            return {
              id: item.id,
              name: item['school.name'] || 'Unknown School',
              city: item['school.city'] || null,
              state: item['school.state'] || null,
              ownership: item['school.ownership'] || null,
              school_url: item['school.school_url'] || null,
              carnegie_basic: item['school.carnegie_basic'] || null,
              locale: item['school.locale'] || null,
              student_size: item.latest?.student?.size || null,
              completion_rate: item.latest?.completion?.completion_rate_4yr_100nt || null,
              earnings_10yr_median: item.latest?.earnings?.['10_yrs_after_entry']?.median || null,
              admission_rate: item.latest?.admissions?.admission_rate?.overall || null,
              tuition_in_state: item.latest?.cost?.tuition?.in_state || null,
              tuition_out_of_state: item.latest?.cost?.tuition?.out_of_state || null,
              attendance_cost: item.latest?.cost?.attendance?.academic_year || null,
              last_updated: new Date().toISOString()
            };
          } catch (error) {
            console.warn(`⚠️  Failed to process school ${item.id}:`, error.message);
            return null;
          }
        })
        .filter(Boolean); // Remove failed records

      allData = allData.concat(processedResults);
      console.log(`✅ Processed page ${page}: ${processedResults.length} schools (Total: ${allData.length})`);

      // Check if we've reached the end
      if (data.metadata && data.metadata.total) {
        const progress = Math.min(page * 100, data.metadata.total);
        console.log(`📊 Progress: ${progress}/${data.metadata.total} records (${Math.round(progress/data.metadata.total*100)}%)`);
        
        if (page * 100 >= data.metadata.total) {
          hasMore = false;
        }
      } else if (processedResults.length < 100) {
        // If we get fewer results than requested, we're probably at the end
        hasMore = false;
      }

      page++;
      
      // Respectful rate limiting
      await delay(1000);
    }

    // Merge with existing data, removing duplicates
    const dataMap = new Map();
    
    // Add existing data first
    existingData.forEach(item => {
      if (item && item.id) {
        dataMap.set(item.id, item);
      }
    });
    
    // Update with new data
    let newCount = 0;
    let updatedCount = 0;
    allData.forEach(item => {
      if (item && item.id) {
        const existing = dataMap.has(item.id);
        dataMap.set(item.id, item);
        if (existing) {
          updatedCount++;
        } else {
          newCount++;
        }
      }
    });

    const finalData = Array.from(dataMap.values())
      .sort((a, b) => a.id - b.id); // Sort by ID for consistency

    // Save final data
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(finalData, null, 2));
    
    console.log('🎉 Data fetch completed successfully!');
    console.log(`📊 Final statistics:`);
    console.log(`   • Total records: ${finalData.length}`);
    console.log(`   • New records: ${newCount}`);
    console.log(`   • Updated records: ${updatedCount}`);
    console.log(`   • Pages processed: ${page - 1}`);
    console.log(`💾 Data saved to: ${OUTPUT_PATH}`);

  } catch (error) {
    console.error('💥 Fatal error during fetch:', error.message);
    console.error('📍 Stack trace:', error.stack);
    
    // Save partial data if we have any
    if (allData.length > 0) {
      const partialPath = path.join(DATA_DIR, 'partial_data.json');
      fs.writeFileSync(partialPath, JSON.stringify(allData, null, 2));
      console.log(`💾 Partial data saved to: ${partialPath} (${allData.length} records)`);
    }
    
    process.exit(1);
  }
}

// Execute the fetch
console.log('🏫 College Scorecard Data Fetcher v2.0');
console.log('=' .repeat(50));
fetchScorecardData().catch(err => {
  console.error('💥 Script failed:', err.message);
  process.exit(1);
});
