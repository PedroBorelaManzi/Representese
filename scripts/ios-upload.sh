#!/usr/bin/env bash
set -euo pipefail

# Exporta o .ipa de um archive JÁ FEITO e sobe pro App Store Connect.
# Use quando o archive de build/ios/App.xcarchive já existe (ex.: o
# ios-release.sh arquivou mas parou no export/upload).
#
# Pré-requisito: um certificado "Apple Distribution" no Keychain
#   (Xcode > Settings > Accounts > Manage Certificates > + > Apple Distribution)

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
[ -f "$ROOT/scripts/release.env" ] && source "$ROOT/scripts/release.env"
KEY_ID="${ASC_KEY_ID:?}"
ISSUER_ID="${ASC_ISSUER_ID:?}"
KEY_PATH="$HOME/.private_keys/AuthKey_${KEY_ID}.p8"
ARCHIVE="$ROOT/build/ios/App.xcarchive"
IPA_DIR="$ROOT/build/ios/ipa"

[ -d "$ARCHIVE" ] || { echo "ERRO: sem archive em $ARCHIVE — rode scripts/ios-release.sh" >&2; exit 1; }

echo "==> export .ipa"
rm -rf "$IPA_DIR"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportPath "$IPA_DIR" \
  -exportOptionsPlist "$ROOT/scripts/ExportOptions.plist" \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$KEY_PATH" \
  -authenticationKeyID "$KEY_ID" \
  -authenticationKeyIssuerID "$ISSUER_ID"

IPA=$(ls "$IPA_DIR"/*.ipa | head -1)
echo "==> upload: $IPA"
xcrun altool --upload-app -f "$IPA" -t ios --apiKey "$KEY_ID" --apiIssuer "$ISSUER_ID"

echo
echo "OK. Aguarde o processamento (~5-30 min) e selecione a build no App Store Connect."
