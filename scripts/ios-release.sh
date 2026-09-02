#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# Release do app iOS pra App Store Connect — sem Xcode Cloud.
#
# Faz: build web -> cap sync -> sobe o build number -> archive -> export .ipa
#      -> upload via App Store Connect API Key (sem senha, sem 2FA).
# Depois: entrar no App Store Connect, selecionar o build e "Submit for Review".
#
# Pré-requisitos (uma vez só):
#   - API Key .p8 em ~/.private_keys/AuthKey_<KEYID>.p8
#   - scripts/release.env preenchido (copie de scripts/release.env.example)
#   - Xcode logado no Apple ID (Xcode > Settings > Accounts)
#   - rodar `xcodebuild` uma vez já tendo clicado "Always Allow" no Keychain
#
# Uso:
#   ./scripts/ios-release.sh            # usa a versão que está no pbxproj
#
# VERSÃO PAREADA COM O ANDROID: `CURRENT_PROJECT_VERSION` (iOS) tem que ser
# igual ao `versionCode` (Android), e `MARKETING_VERSION` igual ao
# `versionName`. Convenção: versionCode = versionName sem o ponto (1.76 -> 176).
# Este script NÃO sobe número sozinho — edite os dois projetos junto, à mão,
# antes de rodar (Android: android/app/build.gradle | iOS: project.pbxproj).
# ---------------------------------------------------------------------------

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# --- config / credenciais ---
[ -f "$ROOT/scripts/release.env" ] && source "$ROOT/scripts/release.env"
SCHEME="App"
PROJECT="ios/App/App.xcodeproj"
PBXPROJ="$PROJECT/project.pbxproj"
KEY_ID="${ASC_KEY_ID:-}"
ISSUER_ID="${ASC_ISSUER_ID:-}"
KEY_PATH="$HOME/.private_keys/AuthKey_${KEY_ID}.p8"
# FORA do repo de propósito: ~/Desktop está no iCloud Drive, que injeta xattrs
# (com.apple.FinderInfo / fileprovider) nos arquivos gerados — e o `codesign`
# recusa isso ("resource fork, Finder information, or similar detritus not
# allowed"). Buildar num diretório fora do iCloud evita o problema.
BUILD_DIR="${IOS_BUILD_DIR:-$HOME/RepresenteseBuild/ios}"
ARCHIVE="$BUILD_DIR/App.xcarchive"
IPA_DIR="$BUILD_DIR/ipa"
DERIVED="$BUILD_DIR/DerivedData"

fail() { echo "ERRO: $*" >&2; exit 1; }
[ -n "$KEY_ID" ]    || fail "ASC_KEY_ID não definido (scripts/release.env)."
[ -n "$ISSUER_ID" ] || fail "ASC_ISSUER_ID não definido (scripts/release.env)."
[ -f "$KEY_PATH" ]  || fail "API Key não encontrada em $KEY_PATH"

AUTH=(-allowProvisioningUpdates
      -authenticationKeyPath "$KEY_PATH"
      -authenticationKeyID "$KEY_ID"
      -authenticationKeyIssuerID "$ISSUER_ID")

echo "==> 1/6  build web (npm run build)"
npm run build

echo "==> 2/6  npx cap sync ios"
npx cap sync ios

echo "==> 3/6  conferir versão (pareada com o Android)"
NEXT=$(grep -m1 -oE 'CURRENT_PROJECT_VERSION = [0-9]+;' "$PBXPROJ" | grep -oE '[0-9]+')
ANDROID_CODE=$(grep -m1 -oE 'versionCode [0-9]+' "$ROOT/android/app/build.gradle" | grep -oE '[0-9]+' || echo "?")
echo "    iOS CURRENT_PROJECT_VERSION = $NEXT | Android versionCode = $ANDROID_CODE"
[ "$NEXT" = "$ANDROID_CODE" ] || echo "    ⚠️  DESPAREADO! ajuste os dois pro mesmo número antes de enviar."

echo "==> 4/6  archive"
mkdir -p "$BUILD_DIR"
rm -rf "$ARCHIVE" "$DERIVED"
# .DS_Store e xattrs do iCloud dentro de ios/ também quebram o codesign
find "$ROOT/ios" -name ".DS_Store" -delete 2>/dev/null || true
xattr -cr "$ROOT/ios/App/App/public" "$ROOT/dist" 2>/dev/null || true
xcodebuild -project "$PROJECT" -scheme "$SCHEME" -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE" \
  -derivedDataPath "$DERIVED" \
  "${AUTH[@]}" \
  clean archive

echo "==> 5/6  export .ipa"
rm -rf "$IPA_DIR"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportPath "$IPA_DIR" \
  -exportOptionsPlist "$ROOT/scripts/ExportOptions.plist" \
  "${AUTH[@]}"
IPA=$(ls "$IPA_DIR"/*.ipa | head -1)
echo "    ipa: $IPA"

echo "==> 6/6  upload pro App Store Connect (altool)"
xcrun altool --upload-app -f "$IPA" -t ios \
  --apiKey "$KEY_ID" --apiIssuer "$ISSUER_ID"

MARKETING=$(grep -m1 -oE 'MARKETING_VERSION = [0-9.]+;' "$PBXPROJ" | grep -oE '[0-9.]+')
echo
echo "======================================================================"
echo " OK. Enviado: versão $MARKETING (build $NEXT)."
echo " Aguarde o e-mail de processamento (~5-30 min)."
echo " Depois: App Store Connect -> seu app -> selecione o build -> Submit."
echo
echo " (o número da versão você já commitou junto com o do Android)"
echo "======================================================================"
