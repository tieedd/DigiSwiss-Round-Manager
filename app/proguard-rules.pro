# Aturan ProGuard / R8 khusus DigiSwiss-Round

-keepattributes *Annotation*,JavascriptInterface,Signature,InnerClasses,EnclosingMethod

# Pertahankan WebView JavaScript Bridge beserta seluruh metode @JavascriptInterface
-keep class com.example.NativeBridge { *; }
-keepclassmembers class com.example.NativeBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Pertahankan komponen Android, FCM Messaging, OTA Manager, dan diagnostik renderer
-keep class com.example.MainActivity { *; }
-keep class com.example.DigiSwissMessagingService { *; }
-keep class com.example.PushRuntimeState { *; }
-keep class com.example.OtaManager { *; }
-keep class com.example.RendererDiagnostics { *; }

# Pertahankan model & struktur JSON yang di-parse di runtime
-keep class org.json.** { *; }
-keep class com.example.model.** { *; }
-keepclassmembers class com.example.** {
    public <init>(...);
}
