const https = require('https');

const API_KEY = 'm5uUlj6ZUFHcEmQrHLIWWo8HwUOAOm5Ad3UcdFb2';  // 직접 키 할당
const PER_PAGE = 100;

function fetchData(page = 0) {
  const API_URL = `https://api.data.gov/ed/collegescorecard/v1/schools?api_key=${API_KEY}` +
                  `&fields=number,id,school.name,school.city,school.state,school.school_url` +
                  `&page=${page}&per_page=${PER_PAGE}`;

  https.get(API_URL, (res) => {
    let data = '';

    res.setEncoding('utf8'); // 응답 인코딩 설정
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        if (!json.results || json.results.length === 0) {
          console.log('더 이상 데이터가 없습니다.');
          return;
        }

        console.log(`페이지: ${page + 1} (데이터 ${json.results.length}개)`);

        for (const school of json.results) {
          console.log(`Number: ${school.number}, ID: ${school.id}, Name: ${school['school.name']}, City: ${school['school.city']}, State: ${school['school.state']}, URL: ${school['school.school_url']}`);
        }

        // 재귀 호출로 다음 페이지 처리
        fetchData(page + 1);

      } catch (error) {
        console.error('JSON 파싱 오류:', error.message);
      }
    });
  }).on('error', (err) => {
    console.error('요청 오류:', err.message);
  });
}

// 스크립트 시작
fetchData();
