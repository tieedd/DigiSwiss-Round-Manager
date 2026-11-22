import com.google.gms.googleservices.GoogleServicesPlugin.MissingGoogleServicesStrategy

plugins {
  alias(libs.plugins.android.application)
  alias(libs.plugins.kotlin.compose)
  alias(libs.plugins.secrets)
  alias(libs.plugins.google.services)
}

android {
  namespace = "com.example"
  compileSdk { version = release(36) { minorApiLevel = 1 } }

  defaultConfig {
    applicationId = "com.digiswiss.round"
    minSdk = 24
    targetSdk = 36
    versionCode = 1
    versionName = "1.0"

    testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

    ndk {
      abiFilters += listOf("arm64-v8a", "armeabi-v7a")
    }
  }

  // Do not remove or modify these signingConfigs. They are necessary for building, installing,
  // and updating Android apps in AI Studio.
  signingConfigs {
    create("release") {
      val keystorePath = System.getenv("KEYSTORE_PATH") ?: "${rootDir}/my-upload-key.jks"
      storeFile = file(keystorePath)
      storePassword = System.getenv("STORE_PASSWORD")
      keyAlias = "upload"
      keyPassword = System.getenv("KEY_PASSWORD")
    }
    create("debugConfig") {
      storeFile = file("${rootDir}/debug.keystore")
      storePassword = "android"
      keyAlias = "androiddebugkey"
      keyPassword = "android"
    }
  }

  buildTypes {
    release {
      isCrunchPngs = false
      isMinifyEnabled = false
      proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
      // Do not remove or modify this signingConfig assignment. It is necessary for Android apps in
      // AI Studio.
      signingConfig = signingConfigs.getByName("release")
    }
    debug {
      // Do not remove or modify this signingConfig assignment. It is necessary for Android apps in
      // AI Studio.
      signingConfig = signingConfigs.getByName("debugConfig")
    }
    create("optimized") {
      initWith(getByName("release"))
      isMinifyEnabled = true
      isShrinkResources = true
      isDebuggable = false
      signingConfig = signingConfigs.getByName("debugConfig")
    }
  }
  androidResources {
    localeFilters += listOf("id", "en")
  }
  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_11
    targetCompatibility = JavaVersion.VERSION_11
  }
  buildFeatures {
    compose = true
    buildConfig = true
  }
  testOptions { unitTests { isIncludeAndroidResources = true } }
  dependenciesInfo {
    includeInApk = false
    includeInBundle = true
  }
}

// Configure the Secrets Gradle Plugin to use .env and .env.example files
// to match the convention used in Web projects.
secrets {
  propertiesFileName = ".env"
  defaultPropertiesFileName = ".env.example"
  ignoreList.add("FIREBASE_APPCHECK_DEBUG_TOKEN")
}

googleServices { missingGoogleServicesStrategy = MissingGoogleServicesStrategy.WARN }

dependencies {
  implementation(platform(libs.androidx.compose.bom))
  implementation(platform(libs.firebase.bom))
  implementation(libs.androidx.activity.compose)
  implementation(libs.androidx.compose.material.icons.core)
  implementation(libs.androidx.compose.material.icons.extended)
  implementation(libs.androidx.compose.material3)
  implementation(libs.androidx.compose.ui)
  implementation(libs.androidx.compose.ui.graphics)
  implementation(libs.androidx.compose.ui.tooling.preview)
  implementation(libs.androidx.core.ktx)
  implementation(libs.androidx.lifecycle.runtime.compose)
  implementation(libs.androidx.lifecycle.runtime.ktx)
  implementation(libs.androidx.lifecycle.viewmodel.compose)
  implementation(libs.kotlinx.coroutines.android)
  implementation(libs.kotlinx.coroutines.core)
  implementation(libs.play.services.code.scanner)
  implementation(libs.play.services.mlkit.barcode.scanning)
  implementation(libs.firebase.messaging)
  testImplementation(libs.androidx.compose.ui.test.junit4)
  testImplementation(libs.androidx.core)
  testImplementation(libs.androidx.junit)
  testImplementation(libs.junit)
  testImplementation(libs.kotlinx.coroutines.test)
  testImplementation(libs.robolectric)
  androidTestImplementation(platform(libs.androidx.compose.bom))
  androidTestImplementation(libs.androidx.compose.ui.test.junit4)
  androidTestImplementation(libs.androidx.espresso.core)
  androidTestImplementation(libs.androidx.junit)
  androidTestImplementation(libs.androidx.runner)
  debugImplementation(libs.androidx.compose.ui.test.manifest)
  debugImplementation(libs.androidx.compose.ui.tooling)
}

abstract class EnsureWebAssetsTask : org.gradle.api.DefaultTask() {
  @get:org.gradle.api.tasks.Internal
  abstract val projectRootDir: org.gradle.api.file.DirectoryProperty

  @get:org.gradle.api.tasks.Internal
  abstract val assetIndexFile: org.gradle.api.file.RegularFileProperty

  @get:org.gradle.api.tasks.Internal
  abstract val viteBinaryFile: org.gradle.api.file.RegularFileProperty

  @get:org.gradle.api.tasks.Internal
  abstract val lockFile: org.gradle.api.file.RegularFileProperty

  @get:org.gradle.api.tasks.Internal
  abstract val webInputs: org.gradle.api.file.ConfigurableFileCollection

  @get:javax.inject.Inject
  abstract val execOperations: org.gradle.process.ExecOperations

  private fun resolveNpmExecutable(): String {
    val isWindows = System.getProperty("os.name").lowercase().contains("win")
    val exeName = if (isWindows) "npm.cmd" else "npm"
    val pathEnv = System.getenv("PATH").orEmpty()
    for (dir in pathEnv.split(File.pathSeparatorChar)) {
      if (dir.isBlank()) continue
      val candidate = File(dir, exeName)
      if (candidate.isFile && candidate.canExecute()) {
        return candidate.absolutePath
      }
    }
    if (!isWindows) {
      for (fallback in listOf("/usr/local/bin/npm", "/usr/bin/npm")) {
        val candidate = File(fallback)
        if (candidate.isFile && candidate.canExecute()) {
          return candidate.absolutePath
        }
      }
    }
    return exeName
  }

  @org.gradle.api.tasks.TaskAction
  fun ensureAssets() {
    val rootDir = projectRootDir.get().asFile
    val indexFile = assetIndexFile.get().asFile
    val hasIndex = indexFile.exists() && indexFile.length() > 0L

    var needsBuild = !hasIndex
    if (!needsBuild) {
      val indexMtime = indexFile.lastModified()
      for (file in webInputs.files) {
        if (file.isFile && file.lastModified() > indexMtime) {
          needsBuild = true
          break
        }
      }
    }

    if (!needsBuild) {
      return
    }

    val npmCmd = resolveNpmExecutable()
    if (!viteBinaryFile.get().asFile.exists()) {
      val installSubCmd = if (lockFile.get().asFile.exists()) "ci" else "install"
      logger.lifecycle("Installing web dependencies via $npmCmd $installSubCmd...")
      execOperations.exec {
        workingDir = rootDir
        commandLine(npmCmd, installSubCmd)
      }
    }

    logger.lifecycle("Building web assets into app/src/main/assets/dist via $npmCmd run build...")
    execOperations.exec {
      workingDir = rootDir
      commandLine(npmCmd, "run", "build")
    }

    if (!indexFile.exists()) {
      throw org.gradle.api.GradleException(
        "Web build finished but ${indexFile.absolutePath} is still missing."
      )
    }
  }
}

val ensureWebAssets = tasks.register<EnsureWebAssetsTask>("ensureWebAssets") {
  projectRootDir.set(rootProject.layout.projectDirectory)
  assetIndexFile.set(layout.projectDirectory.file("src/main/assets/dist/index.html"))
  viteBinaryFile.set(rootProject.layout.projectDirectory.file("node_modules/.bin/vite"))
  lockFile.set(rootProject.layout.projectDirectory.file("package-lock.json"))
  webInputs.from(
    rootProject.fileTree("src"),
    rootProject.layout.projectDirectory.file("index.html"),
    rootProject.layout.projectDirectory.file("package.json"),
    rootProject.layout.projectDirectory.file("vite.config.ts"),
    rootProject.layout.projectDirectory.file("tailwind.config.js"),
    rootProject.layout.projectDirectory.file("postcss.config.js"),
    rootProject.layout.projectDirectory.file("tsconfig.json")
  )
}

tasks.named("preBuild") {
  dependsOn(ensureWebAssets)
}

