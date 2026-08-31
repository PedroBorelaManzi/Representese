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
#   ./scripts/ios-release.sh            # sobe o build number e envia
#   ./scripts/ios-release.sh --no-bump  # usa o build number atual
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
BUILD_DIR="$ROOT/build/ios"
ARCHIVE="$BUILD_DIR/App.xcarchive"
IPA_DIR="$BUILD_DIR/ipa"

BUMP=1
[ "${1:-}" = "--no-bump" ] && BUMP=0

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

if [ "$BUMP" -eq 1 ]; then
  echo "==> 3/6  subir o build number (CURRENT_PROJECT_VERSION)"
  CUR=$(grep -m1 -oE 'CURRENT_PROJECT_VERSION = [0-9]+;' "$PBXPROJ" | grep -oE '[0-9]+')
  NEXT=$((CUR + 1))
  /usr/bin/sed -i '' -E "s/CURRENT_PROJECT_VERSION = [0-9]+;/CURRENT_PROJECT_VERSION = ${NEXT};/g" "$PBXPROJ"
  echo "    build $CUR -> $NEXT"
else
  NEXT=$(grep -m1 -oE 'CURRENT_PROJECT_VERSION = [0-9]+;' "$PBXPROJ" | grep -oE '[0-9]+')
  echo "==> 3/6  build number mantido em $NEXT (--no-bump)"
fi

echo "==> 4/6  archive"
rm -rf "$ARCHIVE"
xcodebuild -project "$PROJECT" -scheme "$SCHEME" -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE" \
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
echo " Commitar o bump:"
echo "   git add $PBXPROJ && git commit -m 'chore(ios): build $NEXT'"
echo "======================================================================"
