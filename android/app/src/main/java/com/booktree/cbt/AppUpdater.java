package com.booktree.cbt;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.ProgressDialog;
import android.content.ActivityNotFoundException;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

import javax.net.ssl.HttpsURLConnection;

/** Checks a public GitHub manifest and delegates installation to Android's installer. */
final class AppUpdater {
    private final Activity activity;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean busy = new AtomicBoolean(false);
    private final AtomicBoolean cancelled = new AtomicBoolean(false);
    private volatile boolean closed;
    private ProgressDialog progress;
    private AlertDialog prompt;
    private File readyApk;
    private boolean waitingForPermission;
    private boolean resumed;
    private boolean readyToInstall;

    AppUpdater(Activity activity) {
        this.activity = activity;
    }

    void check(boolean manual) {
        if (closed) return;
        if (!busy.compareAndSet(false, true)) {
            if (manual) toast("업데이트 확인 또는 다운로드가 진행 중입니다.");
            return;
        }
        if (manual) toast("새 버전을 확인하고 있습니다.");
        executor.execute(() -> {
            try {
                UpdateInfo update = readUpdate();
                ui(() -> {
                    if (!update.isNewerThan(BuildConfig.VERSION_CODE)) {
                        busy.set(false);
                        if (manual) message("업데이트 확인", "최신 버전입니다. (v"
                            + BuildConfig.VERSION_NAME + ")");
                    } else if (Build.VERSION.SDK_INT < update.minSdk) {
                        busy.set(false);
                        if (manual) message("업데이트 확인",
                            "새 버전은 이 기기의 Android 버전을 지원하지 않습니다. 현재 버전은 계속 사용할 수 있습니다.");
                    } else {
                        showUpdate(update);
                    }
                });
            } catch (Exception error) {
                Log.w("BooktreeUpdate", "Update check failed", error);
                ui(() -> {
                    busy.set(false);
                    if (manual) message("업데이트 확인", error instanceof FileNotFoundException
                        ? "업데이트 정보가 아직 게시되지 않았습니다. 잠시 후 다시 확인해 주세요."
                        : "업데이트를 확인하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.");
                });
            }
        });
    }

    private UpdateInfo readUpdate() throws Exception {
        String address = BuildConfig.UPDATE_MANIFEST_URL + "?t=" + System.currentTimeMillis();
        HttpsURLConnection connection = connect(new URL(address));
        try {
            if (connection.getResponseCode() == 404) throw new FileNotFoundException();
            if (connection.getResponseCode() != 200) throw new IOException("Manifest HTTP error");
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            try (InputStream input = connection.getInputStream()) {
                byte[] buffer = new byte[4096];
                int length;
                while ((length = input.read(buffer)) != -1) {
                    if (output.size() + length > 65536) throw new IOException("Manifest too large");
                    output.write(buffer, 0, length);
                }
            }
            String json = output.toString("UTF-8");
            if (json.startsWith("\ufeff")) json = json.substring(1);
            JSONObject data = new JSONObject(json);
            if (data.getInt("schemaVersion") != 1) throw new IOException("Unsupported update schema");
            return new UpdateInfo(data.getInt("versionCode"), data.getString("versionName"),
                data.getInt("minSdk"), data.getString("apkUrl"), data.getString("sha256"),
                data.getLong("sizeBytes"), data.optString("releaseNotes", ""));
        } finally {
            connection.disconnect();
        }
    }

    private void showUpdate(UpdateInfo update) {
        String text = "현재 v" + BuildConfig.VERSION_NAME + " → 새 버전 v" + update.versionName
            + "\n\n" + update.releaseNotes + "\n\nAPK를 내려받은 뒤 설치 화면을 엽니다. 학습 기록은 유지됩니다.";
        prompt = new AlertDialog.Builder(activity)
            .setTitle("새 버전이 있습니다")
            .setMessage(text)
            .setPositiveButton("다운로드", (dialog, which) -> {
                busy.set(false);
                download(update);
            })
            .setNegativeButton("나중에", (dialog, which) -> busy.set(false))
            .setOnCancelListener(dialog -> busy.set(false))
            .show();
    }

    private void download(UpdateInfo update) {
        if (closed || !busy.compareAndSet(false, true)) return;
        readyApk = null;
        readyToInstall = false;
        cancelled.set(false);
        progress = new ProgressDialog(activity);
        progress.setTitle("업데이트 다운로드");
        progress.setMessage("v" + update.versionName + " APK를 다운로드하고 있습니다.");
        progress.setProgressStyle(ProgressDialog.STYLE_HORIZONTAL);
        progress.setMax(100);
        progress.setCancelable(true);
        progress.setOnCancelListener(dialog -> cancelled.set(true));
        progress.setButton(DialogInterface.BUTTON_NEGATIVE, "취소", (dialog, which) -> cancelled.set(true));
        progress.show();

        executor.execute(() -> {
            File partial = new File(activity.getCacheDir(), "updates/update.apk.part");
            File apk = new File(activity.getCacheDir(), "updates/update.apk");
            try {
                File directory = partial.getParentFile();
                if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("Cannot create cache");
                downloadFile(update, partial);
                if (cancelled.get() || closed) throw new IOException("Cancelled");
                update.verifyFile(partial);
                if (cancelled.get() || closed) throw new IOException("Cancelled");
                if (apk.exists() && !apk.delete()) throw new IOException("Cannot replace cache");
                if (!partial.renameTo(apk)) throw new IOException("Cannot finalize APK");
                verifyPackage(apk, update);
                ui(() -> {
                    progress.dismiss();
                    busy.set(false);
                    if (cancelled.get()) return;
                    readyApk = apk;
                    readyToInstall = true;
                    requestInstall();
                });
            } catch (Exception error) {
                if (partial.exists() && !partial.delete()) Log.w("BooktreeUpdate", "Partial APK cleanup failed");
                if (apk.exists() && !apk.delete()) Log.w("BooktreeUpdate", "Invalid APK cleanup failed");
                Log.w("BooktreeUpdate", "APK download or verification failed", error);
                ui(() -> {
                    progress.dismiss();
                    busy.set(false);
                    if (!cancelled.get()) message("업데이트 실패",
                        "APK 다운로드 또는 검증에 실패했습니다. 인터넷 연결과 저장 공간을 확인한 뒤 다시 시도해 주세요.");
                });
            }
        });
    }

    private void downloadFile(UpdateInfo update, File destination) throws IOException {
        HttpsURLConnection connection = connect(new URL(update.apkUrl));
        try {
            if (connection.getResponseCode() != 200) throw new IOException("APK HTTP error");
            long received = 0;
            int previous = -1;
            try (InputStream input = connection.getInputStream();
                 FileOutputStream output = new FileOutputStream(destination)) {
                byte[] buffer = new byte[32768];
                int length;
                while ((length = input.read(buffer)) != -1) {
                    if (cancelled.get() || closed || Thread.currentThread().isInterrupted()) {
                        throw new IOException("Cancelled");
                    }
                    received += length;
                    if (received > update.sizeBytes) throw new IOException("APK exceeds declared size");
                    output.write(buffer, 0, length);
                    int percent = (int) (received * 100 / update.sizeBytes);
                    if (percent != previous) {
                        previous = percent;
                        ui(() -> progress.setProgress(percent));
                    }
                }
            }
        } finally {
            connection.disconnect();
        }
    }

    private HttpsURLConnection connect(URL address) throws IOException {
        for (int redirect = 0; redirect < 6; redirect++) {
            if (!UpdateInfo.isTrustedConnection(address.getProtocol(), address.getHost())) {
                throw new IOException("Untrusted update connection");
            }
            HttpsURLConnection connection = (HttpsURLConnection) address.openConnection();
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(30000);
            connection.setInstanceFollowRedirects(false);
            connection.setUseCaches(false);
            connection.setRequestProperty("Cache-Control", "no-cache");
            connection.setRequestProperty("User-Agent", "BooktreeCBT/" + BuildConfig.VERSION_NAME);
            int status;
            try {
                status = connection.getResponseCode();
            } catch (IOException error) {
                connection.disconnect();
                throw error;
            }
            if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
                String location = connection.getHeaderField("Location");
                connection.disconnect();
                if (location == null) throw new IOException("Missing redirect URL");
                address = new URL(address, location);
            } else {
                return connection;
            }
        }
        throw new IOException("Too many redirects");
    }

    @SuppressWarnings("deprecation")
    private void verifyPackage(File apk, UpdateInfo update) throws Exception {
        PackageManager manager = activity.getPackageManager();
        int flags = Build.VERSION.SDK_INT >= 28
            ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageInfo archive = manager.getPackageArchiveInfo(apk.getAbsolutePath(), flags);
        PackageInfo installed = manager.getPackageInfo(activity.getPackageName(), flags);
        if (archive == null || !activity.getPackageName().equals(archive.packageName)) {
            throw new IOException("Wrong APK package");
        }
        long code = Build.VERSION.SDK_INT >= 28 ? archive.getLongVersionCode() : archive.versionCode;
        if (code != update.versionCode || code <= BuildConfig.VERSION_CODE
            || !update.versionName.equals(archive.versionName)) throw new IOException("Wrong APK version");
        if (Build.VERSION.SDK_INT >= 24 && archive.applicationInfo != null
            && archive.applicationInfo.minSdkVersion > Build.VERSION.SDK_INT) {
            throw new IOException("Unsupported Android version");
        }
        if (!UpdateInfo.sameCertificates(certificates(installed), certificates(archive))) {
            throw new IOException("APK signing certificate mismatch");
        }
    }

    @SuppressWarnings("deprecation")
    private byte[][] certificates(PackageInfo info) {
        Signature[] signatures;
        if (Build.VERSION.SDK_INT >= 28) {
            signatures = info.signingInfo == null ? null : info.signingInfo.getApkContentsSigners();
        } else {
            signatures = info.signatures;
        }
        if (signatures == null) return null;
        byte[][] bytes = new byte[signatures.length][];
        for (int i = 0; i < signatures.length; i++) bytes[i] = signatures[i].toByteArray();
        return bytes;
    }

    private void requestInstall() {
        if (!resumed || readyApk == null || !readyApk.isFile()) return;
        readyToInstall = false;
        if (Build.VERSION.SDK_INT >= 26 && !activity.getPackageManager().canRequestPackageInstalls()) {
            prompt = new AlertDialog.Builder(activity)
                .setTitle("업데이트 설치 허용")
                .setMessage("다음 설정 화면에서 책나무 CBT의 ‘이 출처의 앱 허용’을 켜 주세요. 돌아오면 설치 화면을 엽니다.")
                .setPositiveButton("설정 열기", (dialog, which) -> {
                    try {
                        waitingForPermission = true;
                        activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                            Uri.parse("package:" + activity.getPackageName())));
                    } catch (ActivityNotFoundException | SecurityException error) {
                        waitingForPermission = false;
                        message("설치 안내", "Android 설정에서 책나무 CBT의 알 수 없는 앱 설치를 허용해 주세요.");
                    }
                })
                .setNegativeButton("나중에", null).show();
            return;
        }
        try {
            Uri uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".updates", readyApk);
            Intent install = new Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            activity.startActivity(install);
        } catch (ActivityNotFoundException | SecurityException error) {
            message("설치 안내", "이 기기에서 APK 설치 화면을 열 수 없습니다.");
        }
    }

    void onResume() {
        resumed = true;
        if (!waitingForPermission) {
            if (readyToInstall) requestInstall();
            return;
        }
        waitingForPermission = false;
        if (Build.VERSION.SDK_INT < 26 || activity.getPackageManager().canRequestPackageInstalls()) {
            requestInstall();
        } else {
            toast("설치 권한이 허용되지 않았습니다. 업데이트 확인에서 다시 시도할 수 있습니다.");
        }
    }

    void onPause() {
        resumed = false;
    }

    void close() {
        closed = true;
        cancelled.set(true);
        executor.shutdownNow();
        if (progress != null) progress.dismiss();
        if (prompt != null) prompt.dismiss();
    }

    private void ui(Runnable action) {
        activity.runOnUiThread(() -> {
            if (!closed && !activity.isFinishing() && !activity.isDestroyed()) action.run();
        });
    }

    private void toast(String text) {
        Toast.makeText(activity, text, Toast.LENGTH_SHORT).show();
    }

    private void message(String title, String text) {
        prompt = new AlertDialog.Builder(activity).setTitle(title).setMessage(text)
            .setPositiveButton("확인", null).show();
    }
}
