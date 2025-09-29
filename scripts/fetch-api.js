const https = require('https');

const API_KEY = 'm5uUlj6ZUFHcEmQrHLIWWo8HwUOAOm5Ad3UcdFb2';  // 문자열로 감싸기
const API_URL = `https://api.data.gov/ed/collegescorecard/v1/schools?api_key=${API_KEY}&fields=number,id,school.name,school.city,school.state,school.school_url`;

function fetchData() {
  https.get(API_URL, (res) => {
    let data = '';

    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        // 결과 출력
        for (const school of json.results) {
          console.log(`Number: ${school.number}, ID: ${school.id}, Name: ${school['school.name']}, City: ${school['school.city']}, State: ${school['school.state']}, URL: ${school['school.school_url']}`);
        }
      } catch (e) {
        console.error('Parsing error:', e.message);
      }
    });
  }).on('error', (err) => {
    console.error('Request error:', err.message);
  });
}

fetchData();
