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

/**
 * Sobe versionCode (obrigatório: a Play Console recusa um .aab cujo número não
 * tenha crescido) e, junto, o versionName — que é o texto que o usuário vê na
 * loja. Manter os dois em passo evita a situação de duas versões diferentes
 * aparecendo como "1.3" para quem baixou.
 */
function bumpVersion() {
  const content = fs.readFileSync(BUILD_GRADLE_PATH, "utf8");

  const codeMatch = content.match(/versionCode\s+(\d+)/);
  if (!codeMatch) {
    throw new Error("Não encontrei 'versionCode' em android/app/build.gradle");
  }
  const oldCode = parseInt(codeMatch[1], 10);
  const newCode = oldCode + 1;
  let updated = content.replace(/versionCode\s+\d+/, `versionCode ${newCode}`);

  // Sobe o número menor: "1.4" → "1.5". Formatos fora do padrão maior.menor
  // ficam como estão, para o script não inventar um nome esquisito.
  const nameMatch = content.match(/versionName\s+"(\d+)\.(\d+)"/);
  let novoNome = null;
  if (nameMatch) {
    const maior = parseInt(nameMatch[1], 10);
    const menor = parseInt(nameMatch[2], 10) + 1;
    novoNome = `${maior}.${menor}`;
    updated = updated.replace(/versionName\s+"[^"]*"/, `versionName "${novoNome}"`);
  }

  fs.writeFileSync(BUILD_GRADLE_PATH, updated, "utf8");
  console.log(`\nversionCode: ${oldCode} → ${newCode}`);
  if (novoNome) console.log(`versionName: ${nameMatch[1]}.${nameMatch[2]} → ${novoNome}`);
  else console.log("versionName mantido (formato fora do padrão maior.menor)");

  return { newCode, novoNome };
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

  const { newCode: newVersionCode, novoNome } = bumpVersion();

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
