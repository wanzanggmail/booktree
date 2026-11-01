package com.booktree.cbt;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;
import java.util.Locale;

/** Update metadata validation, independent of Android UI and networking. */
final class UpdateInfo {
    static final long MAX_APK_BYTES = 150L * 1024 * 1024;
    final int versionCode;
    final String versionName;
    final int minSdk;
    final String apkUrl;
    final String sha256;
    final long sizeBytes;
    final String releaseNotes;

    UpdateInfo(int versionCode, String versionName, int minSdk, String apkUrl,
               String sha256, long sizeBytes, String releaseNotes) {
        if (versionCode < 1 || versionCode > 2100000000
            || versionName == null || versionName.length() > 32
            || !versionName.matches("[0-9]+\\.[0-9]+\\.[0-9]+")
            || minSdk < 1 || sizeBytes < 1 || sizeBytes > MAX_APK_BYTES
            || sha256 == null || !sha256.matches("[a-fA-F0-9]{64}")) {
            throw new IllegalArgumentException("업데이트 버전 정보가 올바르지 않습니다.");
        }
        String expected = "https://github.com/wanzanggmail/booktree/releases/download/android-v"
            + versionName + "/booktree-" + versionName + ".apk";
        if (!expected.equals(apkUrl)) {
            throw new IllegalArgumentException("공식 GitHub APK 주소가 아닙니다.");
        }
        this.versionCode = versionCode;
        this.versionName = versionName;
        this.minSdk = minSdk;
        this.apkUrl = apkUrl;
        this.sha256 = sha256.toLowerCase(Locale.ROOT);
        this.sizeBytes = sizeBytes;
        String notes = releaseNotes == null ? "" : releaseNotes.trim();
        this.releaseNotes = notes.substring(0, Math.min(notes.length(), 4096));
    }

    boolean isNewerThan(int installedCode) {
        return versionCode > installedCode;
    }

    static boolean isTrustedConnection(String protocol, String hostname) {
        if (!"https".equals(protocol) || hostname == null) return false;
        String host = hostname.toLowerCase(Locale.ROOT);
        return host.equals("github.com") || host.endsWith(".githubusercontent.com")
            || host.equals("wanzanggmail.github.io");
    }

    void verifyFile(File apk) throws IOException {
        if (apk.length() != sizeBytes) {
            throw new IOException("다운로드한 APK의 크기가 일치하지 않습니다.");
        }
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (FileInputStream input = new FileInputStream(apk)) {
                byte[] buffer = new byte[32768];
                int count;
                while ((count = input.read(buffer)) != -1) digest.update(buffer, 0, count);
            }
            StringBuilder actual = new StringBuilder();
            for (byte value : digest.digest()) {
                actual.append(String.format(Locale.ROOT, "%02x", value & 0xff));
            }
            if (!sha256.equals(actual.toString())) {
                throw new IOException("APK 파일 검증에 실패했습니다. 다시 다운로드해 주세요.");
            }
        } catch (NoSuchAlgorithmException e) {
            throw new IOException("SHA-256 검증을 사용할 수 없습니다.", e);
        }
    }

    static boolean sameCertificates(byte[][] installed, byte[][] downloaded) {
        if (installed == null || downloaded == null || installed.length == 0
            || installed.length != downloaded.length) return false;
        boolean[] used = new boolean[downloaded.length];
        for (byte[] certificate : installed) {
            if (certificate == null) return false;
            boolean found = false;
            for (int i = 0; i < downloaded.length; i++) {
                if (!used[i] && Arrays.equals(certificate, downloaded[i])) {
                    used[i] = true;
                    found = true;
                    break;
                }
            }
            if (!found) return false;
        }
        return true;
    }
}
