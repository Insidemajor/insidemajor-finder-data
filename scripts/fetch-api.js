// WorkflowConfig.java
// GitHub Actions YAML을 자바 변수/객체로 전환한 예시
// 주의: 이는 실행용이 아닌 "구성 데이터 보관" 목적의 POJO입니다.

import java.util.*;

public class WorkflowConfig {

    // 최상위
    String name = "Fetch Scorecard Data";  // 워크플로이름

    // on 블록
    static class OnConfig {
        // 매주 일요일 오전 3시 UTC에 실행
        List<String> scheduleCrons = List.of("0 3 * * 0");  // 매주일요일오전3시UTC에실행

        // 수동 실행 가능
        boolean workflowDispatch = true; // 수동실행가능
    }
    OnConfig on = new OnConfig();

    // jobs 블록
    static class Jobs {
        Job fetchData = new Job(); // fetch-data
    }
    Jobs jobs = new Jobs();

    // 단일 Job
    static class Job {
        String runsOn = "ubuntu-latest"; // 최신우분투서버에서실행
        int timeoutMinutes = 30;         // 제한시간
        List<Step> steps = new ArrayList<>();

        Job() {
            // 1) Checkout repo
            Step checkout = new Step();
            checkout.name = "Checkout repo";
            checkout.uses = "actions/checkout@v4";       // 최신v4체크아웃액션사용
            checkout.with = Map.of(
                "token", "${{ secrets.GITHUB_TOKEN }}",  // 권한토큰
                "fetch-depth", "0"                       // 전체커밋기록가져오기
            );
            steps.add(checkout);

            // 2) Set up Node.js
            Step setupNode = new Step();
            setupNode.name = "Set up Node.js";
            setupNode.uses = "actions/setup-node@v4";    // Node.jsv4액션사용
            setupNode.with = Map.of(
                "node-version", "18",                    // Node.js버전을18로지정
                "cache", "npm"                           // npm캐시기능사용속도개선
            );
            steps.add(setupNode);

            // 3) Install dependencies
            Step installDeps = new Step();
            installDeps.name = "Install dependencies";
            installDeps.run = "npm ci";                  // 락파일기반의존성설치
            installDeps.workingDirectory = "./scripts";  // 스크립트경로에서실행
            steps.add(installDeps);

            // 4) Create data directory
            Step createDir = new Step();
            createDir.name = "Create data directory";
            createDir.run = "mkdir -p ../data";          // data폴더없으면생성
            createDir.workingDirectory = "./scripts";
            steps.add(createDir);

            // 5) Run fetch-api script
            Step runFetch = new Step();
            runFetch.name = "Run fetch-api script";
            runFetch.env = Map.of(
                "COLLEGE_SCORECARD_API_KEY", "${{ secrets.COLLEGE_SCORECARD_API_KEY }}" // API키환경변수주입
            );
            runFetch.run = """
                echo "Starting data fetch..."  // 시작메시지출력
                node fetch-api.js              // 실행스크립트
                """;
            runFetch.workingDirectory = "./scripts";
            steps.add(runFetch);

            // 6) Commit and push updated data
            Step commitPush = new Step();
            commitPush.name = "Commit and push updated data";
            commitPush.run = """
                // Git사용자정보설정
                git config --global user.name 'github-actions[bot]'
                git config --global user.email '41898282+github-actions[bot]@users.noreply.github.com'

                // 변경사항있는지검사후처리
                if [ -n "$(git status --porcelain)" ]; then
                  git add data/filtered_data.json                     // 데이터파일스테이지에추가
                  git commit -m "Update filtered data - $(date -u +'%Y-%m-%d %H:%M:%S UTC')"  // 커밋메시지에UTC타임스탬프포함
                  git push                                           // 원격저장소에푸시
                  echo "✅ Data updated and pushed successfully"     // 성공메시지출력
                else
                  echo "ℹ️  No changes detected, skipping commit"    // 변경없음안내
                fi
                """;
            steps.add(commitPush);
        }
    }

    // 공용 Step 구조
    static class Step {
        String name;                          // - name
        String uses;                          // uses: actions/...
        Map<String, String> with;             // with: { ... }
        String run;                           // run: | (멀티라인 텍스트 블록)
        String workingDirectory;              // working-directory
        Map<String, String> env;              // env
    }

    // 디버그 출력용(선택)
    @Override
    public String toString() {
        return "WorkflowConfig{" +
                "name='" + name + '\'' +
                ", on.scheduleCrons=" + on.scheduleCrons +
                ", on.workflowDispatch=" + on.workflowDispatch +
                ", jobs.fetchData.runsOn=" + jobs.fetchData.runsOn +
                ", jobs.fetchData.timeoutMinutes=" + jobs.fetchData.timeoutMinutes +
                ", jobs.fetchData.steps=" + jobs.fetchData.steps.size() +
                '}';
    }

    // 사용 예시
    public static void main(String[] args) {
        WorkflowConfig cfg = new WorkflowConfig();
        System.out.println(cfg); // 요약 확인
    }
}
