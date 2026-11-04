package com.lonefox.kardashevproject;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.DisplayCutout;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import android.window.OnBackInvokedDispatcher;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * The Kardashev Project on Android: the live web game (/play/?app=android) in the app's own
 * WebView, full screen and held sideways. It updates with the website, so web changes need no new
 * APK.
 *
 * Why not a Trusted Web Activity: a TWA (and a home-screen web app) hands off to Chrome, and some
 * phones (Xiaomi's MIUI / HyperOS) silently block one app from starting another, so tapping the
 * icon did nothing. Everything here runs in this app's process.
 *
 * The page talks to the app through window.KardashevAndroid (saveFile) and window.kpBack (the
 * back gesture), both wrapped in src/platform/platform.ts.
 */
public class LauncherActivity extends Activity {
    private static final int REQ_OPEN_FILE = 1;
    private static final int REQ_SAVE_FILE = 2;

    private FrameLayout root;
    private WebView web;
    private String host;
    private String launchUrl;
    private ValueCallback<Uri[]> fileCallback;
    private String pendingSave;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        host = getString(R.string.hostName);
        launchUrl = getString(R.string.launchUrl);

        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= 28) {
            // draw beside the camera cutout; the root view pads itself clear of it below
            WindowManager.LayoutParams lp = w.getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            w.setAttributes(lp);
        }

        root = new FrameLayout(this);
        root.setBackgroundColor(getColor(R.color.backgroundColor));
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            int l = 0, t = 0, r = 0, b = 0;
            if (Build.VERSION.SDK_INT >= 28) {
                DisplayCutout cut = insets.getDisplayCutout();
                if (cut != null) {
                    l = cut.getSafeInsetLeft();
                    t = cut.getSafeInsetTop();
                    r = cut.getSafeInsetRight();
                    b = cut.getSafeInsetBottom();
                }
            }
            v.setPadding(l, t, r, b);
            return insets;
        });
        setContentView(root);
        immersive();

        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
        }
        createWebView();
        web.loadUrl(launchUrl);

        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::back);
        }
    }

    private void createWebView() {
        web = new WebView(this);
        web.setBackgroundColor(getColor(R.color.backgroundColor));
        root.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        WebSettings ws = web.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true); // saves and settings live in localStorage
        ws.setMediaPlaybackRequiresUserGesture(false);
        ws.setTextZoom(100); // the game has its own UI size setting; don't let the system font size break the layout
        ws.setSupportZoom(false);
        ws.setBuiltInZoomControls(false);
        ws.setDisplayZoomControls(false);
        ws.setUserAgentString(ws.getUserAgentString() + " KardashevAndroid/" + versionName());

        web.addJavascriptInterface(new Bridge(), "KardashevAndroid");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                // the game stays in the app; the website, GitHub and anything else open in the browser
                if ("https".equals(u.getScheme()) && host.equals(u.getHost()) && u.getPath() != null && u.getPath().startsWith("/play")) return false;
                openOutside(u);
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showOffline();
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                // the page's renderer crashed or was killed for memory: start the page again instead
                // of taking the app down with it (the game saves as it goes)
                root.removeView(web);
                web.destroy();
                createWebView();
                web.loadUrl(launchUrl);
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                // Settings → Data → import a save file
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
                pick.addCategory(Intent.CATEGORY_OPENABLE);
                pick.setType("*/*"); // .json files often have no proper type on phones
                try {
                    startActivityForResult(pick, REQ_OPEN_FILE);
                    return true;
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    return false;
                }
            }
        });
    }

    /** What the page can ask of the app (window.KardashevAndroid). */
    private class Bridge {
        /** Export a save: ask where to put it, then write it there. */
        @JavascriptInterface
        public void saveFile(String name, String text) {
            runOnUiThread(() -> {
                pendingSave = text;
                Intent create = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                create.addCategory(Intent.CATEGORY_OPENABLE);
                create.setType("application/json");
                create.putExtra(Intent.EXTRA_TITLE, name);
                try {
                    startActivityForResult(create, REQ_SAVE_FILE);
                } catch (ActivityNotFoundException e) {
                    pendingSave = null;
                    Toast.makeText(LauncherActivity.this, "No app here can save files.", Toast.LENGTH_LONG).show();
                }
            });
        }
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == REQ_OPEN_FILE) {
            if (fileCallback != null) fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
            fileCallback = null;
        } else if (request == REQ_SAVE_FILE) {
            String text = pendingSave;
            pendingSave = null;
            if (result != RESULT_OK || data == null || data.getData() == null || text == null) return;
            try (OutputStream out = getContentResolver().openOutputStream(data.getData())) {
                if (out == null) throw new java.io.IOException("no stream");
                out.write(text.getBytes(StandardCharsets.UTF_8));
                Toast.makeText(this, "Save exported.", Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                Toast.makeText(this, "Couldn't write the save file.", Toast.LENGTH_LONG).show();
            }
        }
    }

    /** Back: the game closes its topmost panel or view first; with nothing open, the app goes to the background. */
    private void back() {
        if (web == null) {
            moveTaskToBack(true);
            return;
        }
        web.evaluateJavascript("(function(){try{return !!(window.kpBack&&window.kpBack())}catch(e){return false}})()", handled -> {
            if ("true".equals(handled)) return;
            if (web.canGoBack()) web.goBack();
            else moveTaskToBack(true);
        });
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        back(); // Android 12 and older; newer versions use the callback registered in onCreate
    }

    private void openOutside(Uri u) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, u));
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "No app can open " + u, Toast.LENGTH_LONG).show();
        }
    }

    /** The first start needs the internet (after that the game's service worker has it cached). */
    private void showOffline() {
        String html = "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'>"
                + "<body style='margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#0b0a12;color:#e8e4f0;font:16px sans-serif;text-align:center'>"
                + "<div style='max-width:440px;padding:16px'><h2 style='margin:0 0 8px'>Can't reach the game</h2>"
                + "<p style='opacity:.8'>The Kardashev Project needs an internet connection the first time it starts. Check your connection and try again.</p>"
                + "<a href='" + launchUrl + "' style='display:inline-block;margin-top:8px;padding:10px 18px;background:#2b4a8a;color:#fff;text-decoration:none;border-radius:4px'>Try again</a>"
                + "</div></body>";
        web.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
    }

    /** Full screen: hide the status and navigation bars; a swipe from the edge shows them for a moment. */
    @SuppressWarnings("deprecation")
    private void immersive() {
        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= 30) {
            w.setDecorFitsSystemWindows(false);
            WindowInsetsController c = w.getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.systemBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        }
    }

    private String versionName() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "0";
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) immersive();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) web.onPause(); // the page sees "hidden" and saves
        CookieManager.getInstance().flush();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
        immersive();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            root.removeView(web);
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
