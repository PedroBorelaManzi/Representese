#!/usr/bin/env node
/**
 * Gera o .aab assinado pra Play Store: builda o site, sincroniza o Capacitor
 * e roda gradlew bundleRelease.
 *
 * NÃO sobe a versão sozinho — o número é PAREADO com o iOS (versionCode ==
 * CURRENT_PROJECT_VERSION, versionName == MARKETING_VERSION). Edite
 * android/app/build.gradle E ios/.../project.pbxproj juntos antes de rodar.
 * Convenção: versionCode = versionName sem o ponto (1.76 -> 176).
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

/**
 * NÃO sobe versão automaticamente. O número é PAREADO com o iOS: o
 * `versionCode` (Android) tem que ser igual ao `CURRENT_PROJECT_VERSION` (iOS)
 * e o `versionName` igual ao `MARKETING_VERSION`. Convenção: versionCode =
 * versionName sem o ponto (1.76 -> 176). Edite os dois projetos à mão, junto,
 * antes de rodar.
 */
function readVersion() {
  const content = fs.readFileSync(BUILD_GRADLE_PATH, "utf8");
  const codeMatch = content.match(/versionCode\s+(\d+)/);
  const nameMatch = content.match(/versionName\s+"([^"]+)"/);
  if (!codeMatch || !nameMatch) {
    throw new Error("Não encontrei versionCode/versionName em android/app/build.gradle");
  }
  const code = parseInt(codeMatch[1], 10);
  const name = nameMatch[1];

  // Confere o pareamento com o iOS.
  try {
    const pbx = fs.readFileSync(
      path.join(ROOT, "ios", "App", "App.xcodeproj", "project.pbxproj"),
      "utf8"
    );
    const iosCode = (pbx.match(/CURRENT_PROJECT_VERSION = (\d+);/) || [])[1];
    const iosName = (pbx.match(/MARKETING_VERSION = ([0-9.]+);/) || [])[1];
    if (String(code) !== iosCode || name !== iosName) {
      console.log(
        `\n⚠️  DESPAREADO com o iOS:\n` +
        `    Android: versionCode ${code} / versionName ${name}\n` +
        `    iOS:     build ${iosCode} / marketing ${iosName}\n` +
        `    Ajuste os dois pro mesmo valor antes de enviar.\n`
      );
    }
  } catch { /* iOS não checado */ }

  console.log(`\nversionCode ${code} / versionName ${name} (deve bater com o iOS)`);
  return { newCode: code, novoNome: name };
}

/**
 * Localiza o JDK que vem junto com o Android Studio.
 *
 * Antes só procurava no caminho do Windows e pelo executável "java.exe", então
 * no macOS o script morria aqui — que é onde o projeto é desenvolvido hoje.
 */
function findJavaHome() {
  const isWindows = os.platform() === "win32";
  const isMac = os.platform() === "darwin";
  const javaBin = isWindows ? "java.exe" : "java";

  const candidates = [
    process.env.JAVA_HOME,
    ...(isMac
      ? [
          "/Applications/Android Studio.app/Contents/jbr/Contents/Home",
          path.join(os.homedir(), "Applications/Android Studio.app/Contents/jbr/Contents/Home"),
        ]
      : []),
    ...(isWindows
      ? [
          "C:\\Program Files\\Android\\Android Studio\\jbr",
          "C:\\Program Files\\Android\\Android Studio\\jre",
        ]
      : []),
    ...(!isWindows && !isMac
      ? ["/opt/android-studio/jbr", "/usr/lib/jvm/default-java"]
      : []),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "bin", javaBin))) return candidate;
  }

  // No macOS o sistema tem um localizador próprio — última tentativa antes de desistir.
  if (isMac) {
    try {
      const detectado = execSync("/usr/libexec/java_home -v 17+", { encoding: "utf8" }).trim();
      if (detectado && fs.existsSync(path.join(detectado, "bin", javaBin))) return detectado;
    } catch {
      // Sem JDK registrado no sistema — cai no erro abaixo.
    }
  }

  throw new Error(
    "Não encontrei um JDK 17+.\n" +
    "Procurei em:\n" +
    candidates.map((c) => `  - ${c}`).join("\n") +
    "\n\nInstale o Android Studio (ele já traz o JDK) ou defina JAVA_HOME antes de rodar:\n" +
    (isMac
      ? '  export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"'
      : "  set JAVA_HOME=C:\\Program Files\\Android\\Android Studio\\jbr")
  );
}

function main() {
  console.log("=== Gerando nova versão Android para a Play Store ===");

  const { newCode: newVersionCode, novoNome } = readVersion();

  // Sem isso, uma dependência nova que veio no git pull derruba o build com
  // "Rollup failed to resolve import" — o package.json lista a biblioteca, mas
  // ela ainda não foi baixada. Com o lock em dia, é rápido e não muda nada.
  run("npm install");
  run("npm run build");
  // Instala no projeto Android qualquer plugin nativo novo.
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

  // Copia com a versão no nome, pra ficar fácil identificar qual .aab subir
  // no Play Console sem precisar abrir o build.gradle pra conferir.
  const versionedName = `app-release-v${novoNome || "semnome"}-${newVersionCode}.aab`;
  const versionedPath = path.join(path.dirname(aabPath), versionedName);
  fs.copyFileSync(aabPath, versionedPath);

  // Alimenta o aviso de "nova versão disponível" dentro do próprio app (ver
  // src/components/UpdateNudge.tsx): o app compara seu versionCode contra
  // este arquivo, publicado junto com o site a cada deploy. Fica em public/
  // pra entrar no próximo `git push`/deploy do site como qualquer outro
  // arquivo estático — não é um passo extra pra lembrar depois.
  const versionFilePath = path.join(ROOT, "public", "app-version.json");
  fs.writeFileSync(
    versionFilePath,
    JSON.stringify({ versionCode: newVersionCode, versionName: novoNome }, null, 2) + "\n"
  );

  console.log("\n=== Pronto! ===");
  console.log(`Versão gerada: ${novoNome || "(versionName inalterado)"} (versionCode ${newVersionCode})`);
  console.log(`Arquivo gerado em: ${versionedPath}`);
  console.log(`public/app-version.json atualizado — sobe junto no próximo deploy do site.`);
  console.log("Agora é só subir esse arquivo no Play Console (trilha de teste ou produção).");
}

main();
