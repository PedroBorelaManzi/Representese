# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# --- Represente-Se! (R8 ligado em release) ---------------------------------
# Stack traces legíveis no Play Console / Sentry.
-keepattributes SourceFile,LineNumberTable,*Annotation*,Signature,InnerClasses,EnclosingMethod
-renamesourcefileattribute SourceFile

# Capacitor: plugins são achados por anotação e chamados por reflexão.
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepclassmembers class * {
    @com.getcapacitor.annotation.PermissionCallback <methods>;
    @com.getcapacitor.annotation.ActivityCallback <methods>;
    @com.getcapacitor.PluginMethod <methods>;
}

# Ponte JS <-> nativo do WebView.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Plugins de terceiros usados pelo app (reflexão/JSON interno).
-keep class com.capgo.** { *; }
-keep class com.revenuecat.** { *; }
-dontwarn com.revenuecat.**
