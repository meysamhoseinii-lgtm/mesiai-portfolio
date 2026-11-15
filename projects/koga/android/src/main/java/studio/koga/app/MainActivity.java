package studio.koga.app;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.GeolocationPermissions;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

public final class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String ORIGIN = "https://" + HOST;
    private static final int LOCATION_REQUEST = 24;
    private static final int GPX_REQUEST = 25;
    private WebView page;
    private GeolocationPermissions.Callback pendingLocation;
    private String pendingOrigin;
    private ValueCallback<Uri[]> pendingFile;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        page = new WebView(this);
        WebSettings settings = page.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " KogaPortfolio/0.1");
        page.setWebViewClient(new LocalContent());
        page.setWebChromeClient(new BrowserActions());
        setContentView(page);
        page.loadUrl(ORIGIN + "/index.html");
    }

    private boolean hasLocationPermission() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private final class BrowserActions extends WebChromeClient {
        @Override
        public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
            if (!ORIGIN.equals(origin)) {
                callback.invoke(origin, false, false);
                return;
            }
            if (hasLocationPermission()) {
                callback.invoke(origin, true, false);
                return;
            }
            if (pendingLocation != null) pendingLocation.invoke(pendingOrigin, false, false);
            boolean requestNeeded = pendingLocation == null;
            pendingOrigin = origin;
            pendingLocation = callback;
            if (requestNeeded) {
                requestPermissions(new String[]{
                    Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION
                }, LOCATION_REQUEST);
            }
        }

        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams parameters) {
            if (pendingFile != null) pendingFile.onReceiveValue(null);
            pendingFile = callback;
            Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            picker.addCategory(Intent.CATEGORY_OPENABLE);
            picker.setType("*/*");
            try {
                startActivityForResult(picker, GPX_REQUEST);
            } catch (ActivityNotFoundException unavailable) {
                pendingFile.onReceiveValue(null);
                pendingFile = null;
            }
            return true;
        }
    }

    private final class LocalContent extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            if (!HOST.equals(url.getHost()) || !"https".equals(url.getScheme())) return null;
            String path = url.getPath();
            if (path == null) return missing();
            String type;
            switch (path) {
                case "/index.html": type = "text/html"; break;
                case "/style.css": type = "text/css"; break;
                case "/data.js":
                case "/map.js":
                case "/app.js": type = "text/javascript"; break;
                case "/font.woff": type = "font/woff"; break;
                default: return missing();
            }
            try {
                Map<String, String> headers = new HashMap<>();
                headers.put("X-Content-Type-Options", "nosniff");
                headers.put("Referrer-Policy", "strict-origin-when-cross-origin");
                return new WebResourceResponse(type, path.endsWith("woff") ? null : "UTF-8",
                    200, "OK", headers, getAssets().open(path.substring(1)));
            } catch (IOException unavailable) {
                return missing();
            }
        }

        private WebResourceResponse missing() {
            return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
                new HashMap<String, String>(), new ByteArrayInputStream(new byte[0]));
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            if (request.isForMainFrame() && request.hasGesture() && "https".equals(url.getScheme()) &&
                !HOST.equals(url.getHost())) {
                try { startActivity(new Intent(Intent.ACTION_VIEW, url)); }
                catch (ActivityNotFoundException unavailable) { return true; }
            }
            return true;
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grants) {
        super.onRequestPermissionsResult(requestCode, permissions, grants);
        if (requestCode == LOCATION_REQUEST && pendingLocation != null) {
            pendingLocation.invoke(pendingOrigin, hasLocationPermission(), false);
            pendingLocation = null;
            pendingOrigin = null;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int result, Intent data) {
        super.onActivityResult(requestCode, result, data);
        if (requestCode != GPX_REQUEST || pendingFile == null) return;
        Uri uri = data == null ? null : data.getData();
        pendingFile.onReceiveValue(result == RESULT_OK && uri != null && "content".equals(uri.getScheme())
            ? new Uri[]{uri} : null);
        pendingFile = null;
    }

    @Override
    protected void onDestroy() {
        if (pendingFile != null) pendingFile.onReceiveValue(null);
        if (pendingLocation != null) pendingLocation.invoke(pendingOrigin, false, false);
        if (page.getParent() instanceof ViewGroup) ((ViewGroup) page.getParent()).removeView(page);
        page.destroy();
        super.onDestroy();
    }
}
