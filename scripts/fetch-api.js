const https = require('https');

// 환경변수에서 API 키 읽기
const API_KEY = process.env.COLLEGE_SCORECARD_API_KEY || 'your_default_api_key_here';
const PER_PAGE = 100;
const MAX_PAGES = 50; // 최대 페이지 수 제한

function fetchData(page = 0) {
  if (page >= MAX_PAGES) {
    console.log('최대 페이지 수 도달. 종료합니다.');
    return;
  }

  const API_URL = `https://api.data.gov/ed/collegescorecard/v1/schools?api_key=${API_KEY}` +
                  `&fields=number,id,school.name,school.city,school.state,school.school_url` +
                  `&page=${page}&per_page=${PER_PAGE}`;

  https.get(API_URL, (res) => {
    let data = '';

    res.setEncoding('utf8');
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        if (!json.results || json.results.length === 0) {
          console.log('더 이상 데이터가 없습니다.');
          return;
        }

        console.log(`페이지: ${page + 1} (데이터 ${json.results.length}개)`);

        json.results.forEach(school => {
          console.log(`Number: ${school.number}, ID: ${school.id}, Name: ${school.school.name}, City: ${school.school.city}, State: ${school.school.state}, URL: ${school.school.school_url}`);
        });

        fetchData(page + 1);

      } catch (error) {
        console.error('JSON 파싱 오류:', error.message);
      }
    });
  }).on('error', (err) => {
    console.error('요청 오류:', err.message);
  });
}

fetchData();
