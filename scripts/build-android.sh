#!/usr/bin/env bash
# =============================================================================
#  build-android.sh — Build automático do app EdgeData (Expo / React Native)
#  Uso: ./scripts/build-android.sh [debug|release]   (padrão: debug)
# =============================================================================

set -euo pipefail

# ─── Cores ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERRO]${NC} $*" >&2; exit 1; }

# ─── Parâmetros ──────────────────────────────────────────────────────────────
BUILD_TYPE="${1:-debug}"
BUILD_TYPE_LOWER=$(echo "$BUILD_TYPE" | tr '[:upper:]' '[:lower:]')
BUILD_TYPE_UPPER=$(echo "$BUILD_TYPE" | tr '[:lower:]' '[:upper:]')

if [[ "$BUILD_TYPE_LOWER" != "debug" && "$BUILD_TYPE_LOWER" != "release" ]]; then
  error "Tipo de build inválido: '$BUILD_TYPE'. Use 'debug' ou 'release'."
fi

# ─── Diretórios ──────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$ROOT_DIR/apps/mobile"
ANDROID_DIR="$APP_DIR/android"
APK_SOURCE_DIR="$ANDROID_DIR/app/build/outputs/apk/$BUILD_TYPE_LOWER"
DIST_DIR="$ROOT_DIR/dist"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║         EdgeData — Build Automático ($BUILD_TYPE_UPPER)         ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

# ─── 1. Verificar dependências ────────────────────────────────────────────────
info "Verificando dependências do sistema..."

check_cmd() {
  if ! command -v "$1" &>/dev/null; then
    error "$1 não encontrado. Instale antes de continuar."
  fi
  success "$1 encontrado: $(command -v "$1")"
}

check_cmd node
check_cmd npm
check_cmd java

if [[ -z "${ANDROID_HOME:-}" ]]; then
  # Tenta localizar o SDK em caminhos comuns
  for SDK_GUESS in "$HOME/Android/Sdk" "$HOME/android/sdk" "/opt/android-sdk"; do
    if [[ -d "$SDK_GUESS" ]]; then
      export ANDROID_HOME="$SDK_GUESS"
      export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/tools:$PATH"
      break
    fi
  done
fi

if [[ -z "${ANDROID_HOME:-}" ]]; then
  error "ANDROID_HOME não está definido e o Android SDK não foi encontrado nos caminhos padrão.\nDefina a variável de ambiente ANDROID_HOME antes de rodar este script."
fi
success "ANDROID_HOME: $ANDROID_HOME"

# Versão do Node e Java
NODE_VER=$(node --version)
JAVA_VER=$(java -version 2>&1 | head -1)
info "Node.js: $NODE_VER | Java: $JAVA_VER"

# ─── 2. Navegar para o diretório do app ───────────────────────────────────────
info "Diretório do app: $APP_DIR"
cd "$APP_DIR"

# ─── 3. Instalar dependências npm ────────────────────────────────────────────
if [[ ! -d "node_modules" ]]; then
  info "node_modules não encontrado. Instalando dependências..."
  npm install
  success "Dependências instaladas."
else
  info "node_modules já existe. Pulando npm install."
  info "  (para forçar reinstalação remova a pasta node_modules)"
fi

# ─── 4. Garantir que o Android nativo está gerado (expo prebuild) ─────────────
if [[ ! -f "$ANDROID_DIR/gradlew" ]]; then
  info "Pasta Android não encontrada. Executando expo prebuild..."
  npx expo prebuild --platform android --clean
  success "Prebuild concluído."
else
  info "Pasta Android já existe. Pulando expo prebuild."
fi

# ─── 5. Permissão no gradlew ──────────────────────────────────────────────────
chmod +x "$ANDROID_DIR/gradlew"

# ─── 6. Build Android via Gradle ──────────────────────────────────────────────
GRADLE_TASK="assemble${BUILD_TYPE_UPPER}"
info "Iniciando build Android: $GRADLE_TASK ..."
echo ""

START_TIME=$(date +%s)

cd "$ANDROID_DIR"
./gradlew "$GRADLE_TASK" --no-daemon 2>&1 | while IFS= read -r line; do
  # Filtra e colore as linhas do Gradle
  if echo "$line" | grep -qE "^> Task"; then
    echo -e "  ${CYAN}${line}${NC}"
  elif echo "$line" | grep -qiE "(error|failed|failure)"; then
    echo -e "  ${RED}${line}${NC}"
  elif echo "$line" | grep -qiE "(warning|warn)"; then
    echo -e "  ${YELLOW}${line}${NC}"
  elif echo "$line" | grep -qiE "BUILD SUCCESSFUL"; then
    echo -e "  ${GREEN}${BOLD}${line}${NC}"
  else
    echo "  $line"
  fi
done

END_TIME=$(date +%s)
ELAPSED=$(( END_TIME - START_TIME ))

echo ""

# ─── 7. Verificar se o APK foi gerado ─────────────────────────────────────────
APK_FILE=$(find "$APK_SOURCE_DIR" -name "*.apk" 2>/dev/null | head -1)

if [[ -z "$APK_FILE" ]]; then
  error "APK não encontrado em $APK_SOURCE_DIR. O build pode ter falhado."
fi

success "Build concluído em ${ELAPSED}s!"

# ─── 8. Copiar APK para /dist ─────────────────────────────────────────────────
mkdir -p "$DIST_DIR"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
APK_NAME="EdgeData_${BUILD_TYPE_LOWER}_${TIMESTAMP}.apk"
DEST_APK="$DIST_DIR/$APK_NAME"
cp "$APK_FILE" "$DEST_APK"

APK_SIZE=$(du -sh "$DEST_APK" | cut -f1)

echo ""
echo -e "${BOLD}─────────────────────────────────────────────────────${NC}"
echo -e "${GREEN}${BOLD} APK gerado com sucesso!${NC}"
echo -e "  Arquivo : ${BOLD}$DEST_APK${NC}"
echo -e "  Tamanho : ${BOLD}$APK_SIZE${NC}"
echo -e "  Tipo    : ${BOLD}$BUILD_TYPE_UPPER${NC}"
echo -e "  Tempo   : ${BOLD}${ELAPSED}s${NC}"
echo -e "${BOLD}─────────────────────────────────────────────────────${NC}"
echo ""
