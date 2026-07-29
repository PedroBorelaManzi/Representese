#!/usr/bin/env node
/**
 * Automatiza o processo de gerar uma nova versão do Android pra Play Store:
 * builda o site, sincroniza com o Capacitor, sobe o versionCode automaticamente
 * e gera o .aab assinado com gradlew bundleRelease.
 *
 * Uso: npm run android:release
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const ROOT = path.join(__dirname, "..");
const BUILD_GRADLE_PATH = path.join(ROOT, "android", "app", "build.gradle");

function run(cmd, opts = {}) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: ROOT, ...opts });
}

function bumpVersionCode() {
  const content = fs.readFileSync(BUILD_GRADLE_PATH, "utf8");
  const match = content.match(/versionCode\s+(\d+)/);
  if (!match) {
    throw new Error("Não encontrei 'versionCode' em android/app/build.gradle");
  }
  const oldCode = parseInt(match[1], 10);
  const newCode = oldCode + 1;
  const updated = content.replace(/versionCode\s+\d+/, `versionCode ${newCode}`);
  fs.writeFileSync(BUILD_GRADLE_PATH, updated, "utf8");
  console.log(`\nversionCode atualizado: ${oldCode} → ${newCode}`);
  return newCode;
}

function findJavaHome() {
  const candidates = [
    "C:\\Program Files\\Android\\Android Studio\\jbr",
    process.env.JAVA_HOME,
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "bin", "java.exe"))) return candidate;
  }
  throw new Error(
    "Não encontrei um JDK 17+ (esperava o do Android Studio em 'C:\\Program Files\\Android\\Android Studio\\jbr'). " +
    "Se o Android Studio estiver instalado em outro lugar, defina a variável JAVA_HOME antes de rodar este script."
  );
}

function main() {
  console.log("=== Gerando nova versão Android para a Play Store ===");

  const newVersionCode = bumpVersionCode();

  run("npm run build");
  run("npx cap sync android");

  const javaHome = findJavaHome();
  const isWindows = os.platform() === "win32";
  const gradlewPath = path.join(
    ROOT,
    "android",
    isWindows ? "gradlew.bat" : "gradlew"
  );

  run(`"${gradlewPath}" bundleRelease`, {
    cwd: path.join(ROOT, "android"),
    env: { ...process.env, JAVA_HOME: javaHome },
  });

  const aabPath = path.join(
    ROOT,
    "android",
    "app",
    "build",
    "outputs",
    "bundle",
    "release",
    "app-release.aab"
  );

  console.log("\n=== Pronto! ===");
  console.log(`versionCode desta versão: ${newVersionCode}`);
  console.log(`Arquivo gerado em: ${aabPath}`);
  console.log("Agora é só subir esse arquivo no Play Console (trilha de teste ou produção).");
}

main();
