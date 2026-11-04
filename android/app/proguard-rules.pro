# The page calls these through window.KardashevAndroid: keep them under their own names.
-keepclassmembers class com.lonefox.kardashevproject.LauncherActivity$Bridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface
