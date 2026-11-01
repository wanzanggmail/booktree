# 책나무 CBT Android APK

기존 웹앱과 모든 시험 JSON을 APK 안에 포함하는 오프라인 Android 앱입니다.
패키지 ID는 `com.booktree.cbt`이며 Android 7.0 이상을 지원합니다.
현재 호호 스터디와 문제집 기준 본문 빈칸 시험이 포함된 버전은 `1.3.3`입니다. 시험은 오프라인으로 이용하고,
새 버전 확인과 APK 다운로드에만 인터넷을 사용합니다. 업데이트 설치 시에는
Android의 ‘이 출처의 앱 허용’ 설정과 사용자의 설치 확인이 필요합니다.

## 설치 및 배포

1. `dist/booktree-1.2.0.apk`를 휴대폰으로 복사하거나 파일로 공유합니다.
2. 휴대폰에서 APK를 열고, 파일을 연 앱에 대한 **이 출처의 앱 설치 허용**을 선택합니다.
3. **책나무 CBT**를 실행합니다. 문제와 예문은 설치 직후부터 오프라인으로 이용할 수 있습니다.

웹사이트/PWA와 APK는 별도 저장 공간을 사용하므로 기존 웹사이트의 진행 기록이
APK로 자동 이전되지는 않습니다. APK의 진행 기록은 앱을 종료한 뒤에도 유지됩니다.
앱을 삭제하거나 Android 설정에서 앱 데이터를 지우면 진행 기록도 삭제됩니다.

## 다시 빌드

JDK 17 또는 21, Android SDK Platform 35, Build Tools 35.0.0이 필요합니다.
이 프로젝트에 준비된 `.android-tools/`가 있으면 스크립트가 자동 사용합니다.
Android Studio의 SDK를 사용하려면 `ANDROID_HOME`과 `JAVA_HOME`을 지정합니다.

```powershell
powershell -ExecutionPolicy Bypass -File .\android\build-apk.ps1
```

스크립트는 웹 자산을 최신 상태로 복사한 뒤 release APK를 빌드하고
`dist/`에 설치 파일과 SHA-256 체크섬을 생성합니다.

## 서명과 업데이트

첫 release 빌드 시 `android/signing/booktree-release.jks`와
`android/signing/signing.properties`가 생성됩니다. 두 파일 모두 Git에서 제외됩니다.
**이 폴더는 별도의 안전한 위치에 백업하세요.** 같은 앱을 업데이트하려면 원래 서명 키가
필요합니다. `signing.properties`에는 키 암호가 있으므로 APK와 함께 배포하지 마세요.

새 버전은 `version.properties`에서 관리합니다. `bump-version.ps1`이
`versionName`을 변경하면서 `versionCode`를 1씩 증가시킵니다. 같은 키로 빌드한 APK를 기존 앱 위에 설치하면
이어 풀기 기록을 유지하면서 업데이트할 수 있습니다.

APK는 빌드 당시의 웹 자산을 사용합니다. GitHub Pages 수정 사항을 포함하려면
APK도 다시 빌드해 배포해야 합니다.

## GitHub 업데이트

앱은 실행 시 `https://wanzanggmail.github.io/booktree/updates/latest.json`을 확인합니다.
홈 화면의 **업데이트 확인** 버튼으로도 확인할 수 있습니다. 네트워크가 없거나
아직 버전 파일이 게시되지 않았을 때 자동 확인은 조용히 끝나며 시험은 계속 사용할 수 있습니다.

설치된 `versionCode`보다 큰 버전이 있으면 변경 내용을 안내하고, 사용자가 다운로드를
선택한 뒤 GitHub Releases의 APK를 받습니다. 파일 크기·SHA-256·패키지 ID·버전·서명을
검사한 후 Android 설치 화면을 엽니다. 현재 서명 키와 다른 APK, 낮은 버전,
공식 저장소가 아닌 다운로드 주소는 거부합니다.

**기존 1.0.0 APK에는 업데이트 기능이 없습니다. 처음 한 번은 1.1.0 이상(현재 1.2.0)을 수동으로 덮어 설치해야 합니다.**
앱을 삭제할 필요는 없습니다. 1.1.0부터 다음 업데이트를 앱 안에서 받을 수 있습니다.

새 버전 제작 예시:

```powershell
.\android\bump-version.ps1 -VersionName 1.2.1
# android/release-notes.txt에 변경 내용을 작성합니다.
.\android\build-apk.ps1
```

빌드와 함께 자동 검사도 실행하려면 `build-apk.ps1 -Verify`를 사용합니다.
업데이트 정책 단위 테스트와 Android lint가 통과해야 배포 파일을 생성합니다.

release 빌드는 APK·체크섬과 함께 `updates/latest.json` 및 `dist/latest.json`을
자동 생성합니다. 이 JSON에는 실제 APK의 SHA-256과 크기, 최소 Android API,
버전, 변경 내용, 정해진 GitHub Releases 다운로드 주소가 들어갑니다.
`updates/latest.json`은 배포용 공개 메타데이터이며 APK나 서명 키를 담지 않습니다.

**게시 순서: APK Release를 먼저 올리고, latest.json을 제공하는 Pages를 나중에 갱신합니다.**
존재하지 않는 APK를 앱이 안내하는 상황을 피하려면 이 순서를 지켜 주세요.
릴리스가 된 버전의 파일은 덮어쓰지 말고 새 버전을 올립니다.

GitHub CLI를 사용하는 예시(사용자가 게시를 요청한 경우 실행):

```powershell
# 현재 버전 파일과 소스, 업데이트 JSON을 먼저 로컬 커밋합니다.
git tag android-v1.2.1
git push origin android-v1.2.1
gh release create android-v1.2.1 dist/booktree-1.2.1.apk dist/booktree-1.2.1.apk.sha256 --title "책나무 CBT 1.2.1" --notes-file android/release-notes.txt
# APK가 공개된 뒤 main을 푸시하면 Pages의 latest.json이 갱신됩니다.
git push origin main
```

태그 이름은 `android-v<versionName>`, APK 이름은 `booktree-<versionName>.apk`를 사용합니다.
공개 저장소의 Releases와 Pages를 전제로 하며 앱에 GitHub 토큰을 넣지 않습니다.
이 기능은 Android 사용자가 설치를 확인하는 방식이고 무인 설치를 수행하지 않습니다.

## 구현

- AndroidX `WebViewAssetLoader`가 `https://appassets.androidplatform.net/assets/www/`
  주소에서 APK에 포함된 파일을 제공합니다. 상대 경로 `fetch()`와 `localStorage`를 지원합니다.
- JavaScript 확인/알림 대화상자를 Android 대화상자로 표시합니다.
- 파일 접근과 혼합 콘텐츠를 허용하지 않고, release에서는 WebView 디버깅을 끕니다.
- 앱 업데이트 연결은 네이티브 HTTPS 코드로 처리하며, WebView는 APK 내부 자산만 읽습니다.
- FileProvider는 앱 캐시의 `updates/` 폴더만 설치 프로그램에 일시적으로 읽기 허용합니다.
- PWA 서비스 워커는 APK 안에서는 등록하지 않아 업데이트 시 이전 코드가 캐시에 남지 않습니다.
- `syncWebAssets`는 공개 웹 파일만 복사하며, Git·빌드 도구·서명 파일은 포함하지 않습니다.

## 시스템 영역 처리

외부 FrameLayout이 시스템 바·화면 잘림·키보드 여백을 받아 WebView의 실제 크기를 줄입니다.
웹 화면 안쪽 패딩에 의존하지 않아 하단 고정 버튼도 시스템 내비게이션 바 위에 배치됩니다.
이미 처리한 여백은 하위 WebView로 다시 전달하지 않습니다.
