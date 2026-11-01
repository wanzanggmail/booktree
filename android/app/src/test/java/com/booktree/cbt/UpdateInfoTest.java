package com.booktree.cbt;

import static org.junit.Assert.*;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class UpdateInfoTest {
    private static final String HASH = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    private static final String URL = "https://github.com/wanzanggmail/booktree/releases/download/android-v1.2.0/booktree-1.2.0.apk";
    @Rule public TemporaryFolder temp = new TemporaryFolder();

    private UpdateInfo info() {
        return new UpdateInfo(3, "1.2.0", 24, URL, HASH, 3, "Changes");
    }

    @Test public void comparesNumericCodesAndDoesNotOfferDowngrades() {
        assertTrue(info().isNewerThan(2));
        assertFalse(info().isNewerThan(3));
        assertFalse(info().isNewerThan(4));
    }

    @Test public void rejectsNonOfficialAndInsecureDownloadLocations() {
        for (String url : new String[]{URL.replace("https:", "http:"),
            URL.replace("wanzanggmail/booktree/", "someone/booktree/"),
            URL.replace("github.com/", "github.com.evil.example/"),
            URL + "?token=anything", URL.replace("android-v1.2.0", "android-v1.3.0")}) {
            assertThrows(IllegalArgumentException.class,
                () -> new UpdateInfo(3, "1.2.0", 24, url, HASH, 3, ""));
        }
    }

    @Test public void rejectsBadVersionHashAndExcessiveFileSize() {
        assertThrows(IllegalArgumentException.class, () -> new UpdateInfo(0, "1.2.0", 24, URL, HASH, 3, ""));
        assertThrows(IllegalArgumentException.class, () -> new UpdateInfo(3, "../evil", 24, URL, HASH, 3, ""));
        assertThrows(IllegalArgumentException.class, () -> new UpdateInfo(3, "1.2.0", 24, URL, "bad", 3, ""));
        assertThrows(IllegalArgumentException.class, () -> new UpdateInfo(3, "1.2.0", 24, URL, HASH, 0, ""));
        assertThrows(IllegalArgumentException.class,
            () -> new UpdateInfo(3, "1.2.0", 24, URL, HASH, UpdateInfo.MAX_APK_BYTES + 1, ""));
    }

    @Test public void allowsGithubCdnButRejectsHttpsDowngradesAndLookalikeHosts() {
        assertTrue(UpdateInfo.isTrustedConnection("https", "release-assets.githubusercontent.com"));
        assertTrue(UpdateInfo.isTrustedConnection("https", "wanzanggmail.github.io"));
        assertFalse(UpdateInfo.isTrustedConnection("http", "github.com"));
        assertFalse(UpdateInfo.isTrustedConnection("https", "evilgithubusercontent.com"));
        assertFalse(UpdateInfo.isTrustedConnection("https", "github.com.evil.example"));
        assertFalse(UpdateInfo.isTrustedConnection("https", "someone.github.io"));
    }

    @Test public void acceptsCompleteFileWithExpectedHash() throws Exception {
        File file = temp.newFile();
        Files.write(file.toPath(), "abc".getBytes(StandardCharsets.UTF_8));
        info().verifyFile(file);
    }

    @Test public void rejectsTamperedFileEvenWhenLengthMatches() throws Exception {
        File file = temp.newFile();
        Files.write(file.toPath(), "abd".getBytes(StandardCharsets.UTF_8));
        assertThrows(IOException.class, () -> info().verifyFile(file));
    }

    @Test public void rejectsTruncatedFile() throws Exception {
        File file = temp.newFile();
        Files.write(file.toPath(), "ab".getBytes(StandardCharsets.UTF_8));
        assertThrows(IOException.class, () -> info().verifyFile(file));
    }

    @Test public void rejectsDifferentAndMissingSigningCertificates() {
        assertFalse(UpdateInfo.sameCertificates(null, new byte[][]{{1}}));
        assertFalse(UpdateInfo.sameCertificates(new byte[][]{{1}}, null));
        assertFalse(UpdateInfo.sameCertificates(new byte[0][], new byte[0][]));
        assertFalse(UpdateInfo.sameCertificates(new byte[][]{{1}}, new byte[][]{{2}}));
        assertFalse(UpdateInfo.sameCertificates(new byte[][]{{1}}, new byte[][]{{1}, {2}}));
        assertFalse(UpdateInfo.sameCertificates(new byte[][]{{1}, {2}}, new byte[][]{{1}, {1}}));
    }

    @Test public void acceptsSameSignerSetRegardlessOfOrder() {
        assertTrue(UpdateInfo.sameCertificates(new byte[][]{{1}, {2}}, new byte[][]{{2}, {1}}));
    }
}
