#!/usr/bin/env bash
# Build local EAS (development ou preview), choix de l'appareil adb, installation et lancement.
#
#   npm run android:build                 # demande le profil et l'appareil
#   npm run android:build -- preview      # profil imposé
#   npm run android:build -- dev --last   # réinstalle le dernier APK de ce profil, sans rebuild
set -euo pipefail

cd "$(dirname "$0")/.."

# --- SDK Android -------------------------------------------------------------
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="$ANDROID_HOME/platform-tools:$PATH"
command -v adb >/dev/null || { echo "adb introuvable (ANDROID_HOME=$ANDROID_HOME)"; exit 1; }

# --- Arguments ---------------------------------------------------------------
PROFILE=""
LAST=0
for arg in "$@"; do
  case "$arg" in
    dev|development) PROFILE=development ;;
    preview) PROFILE=preview ;;
    --last) LAST=1 ;;
    *) echo "Argument inconnu : $arg"; exit 1 ;;
  esac
done

# --- Sélecteur ↑/↓ + Entrée (bash 3.2 de macOS, sans dépendance) ---------------
# Usage : choose "Titre" option… ; l'index choisi est mis dans CHOICE.
trap 'tput cnorm >/dev/tty 2>/dev/null || true' EXIT
choose() {
  local title="$1"
  shift
  local opts=("$@") n=$# sel=0 key i
  tput civis >/dev/tty 2>/dev/null || true
  printf '%s  \033[2m(↑/↓, Entrée)\033[0m\n' "$title" >/dev/tty
  while true; do
    for ((i = 0; i < n; i++)); do
      if ((i == sel)); then
        printf '\033[2K  \033[36m❯ %s\033[0m\n' "${opts[i]}"
      else
        printf '\033[2K    %s\n' "${opts[i]}"
      fi
    done >/dev/tty
    IFS= read -rsn1 key </dev/tty
    if [[ "$key" == $'\e' ]]; then
      read -rsn2 key </dev/tty
      case "$key" in
        '[A') sel=$(((sel - 1 + n) % n)) ;;
        '[B') sel=$(((sel + 1) % n)) ;;
      esac
    elif [[ "$key" == k ]]; then
      sel=$(((sel - 1 + n) % n))
    elif [[ "$key" == j ]]; then
      sel=$(((sel + 1) % n))
    elif [[ -z "$key" ]]; then
      break
    fi
    printf '\033[%dA' "$n" >/dev/tty
  done
  # Replie le menu sur une ligne : « Titre ❯ choix ».
  printf '\033[%dA\033[J%s \033[36m❯ %s\033[0m\n' "$((n + 1))" "$title" "${opts[sel]}" >/dev/tty
  tput cnorm >/dev/tty 2>/dev/null || true
  CHOICE=$sel
}

if [[ -z "$PROFILE" ]]; then
  choose "Profil" "development — dev client (com.mypersonallife.app.dev)" "preview — vraie app (com.mypersonallife.app)"
  if ((CHOICE == 0)); then PROFILE=development; else PROFILE=preview; fi
fi

if [[ "$PROFILE" == development ]]; then PACKAGE=com.mypersonallife.app.dev; else PACKAGE=com.mypersonallife.app; fi
OUT_DIR=build
mkdir -p "$OUT_DIR"

# --- Appareil ----------------------------------------------------------------
list_devices() { adb devices | awk 'NR>1 && $2=="device" {print $1}'; }

pick_device() {
  local ids labels d state model addr
  while true; do
    ids=()
    labels=()
    while read -r d state; do
      if [[ "$state" == device ]]; then
        model="$(adb -s "$d" shell getprop ro.product.model 2>/dev/null | tr -d '\r')"
        ids+=("$d")
        labels+=("$model  ($d)")
      else
        ids+=("")
        labels+=("$d — $state")
      fi
    done < <(adb devices | awk 'NR>1 && NF>=2 {print $1, $2}')
    ids+=(__refresh__ __connect__ __quit__)
    labels+=("↻ Rafraîchir la liste" "+ Connecter en sans fil (IP:port)…" "✕ Quitter")

    choose "Appareil" "${labels[@]}"
    case "${ids[CHOICE]}" in
      __refresh__) ;;
      __connect__)
        read -rp "IP:port (Options pour les développeurs › Débogage sans fil) : " addr </dev/tty
        if [[ -n "$addr" ]]; then adb connect "$addr" || true; fi
        ;;
      __quit__) exit 1 ;;
      "") echo "Appareil inutilisable : autorise le débogage sur le téléphone, puis rafraîchis." ;;
      *)
        DEVICE="${ids[CHOICE]}"
        break
        ;;
    esac
  done
}

# Choisi avant le build pour ne pas attendre 10 minutes et découvrir qu'aucun téléphone n'est là.
pick_device

# --- Build -------------------------------------------------------------------
if ((LAST)); then
  APK="$(ls -t "$OUT_DIR"/my-butler-"$PROFILE"-*.apk 2>/dev/null | head -1 || true)"
  [[ -n "$APK" ]] || { echo "Aucun APK $PROFILE dans $OUT_DIR/"; exit 1; }
  echo "APK existant : $APK"
else
  # Le build local EAS ne prend que les fichiers suivis par git.
  untracked="$(git ls-files --others --exclude-standard)"
  if [[ -n "$untracked" ]]; then
    echo "⚠️  Fichiers non suivis par git (absents du build) :"
    echo "$untracked" | sed 's/^/   /'
    read -rp "Continuer quand même ? [o/N] " ok
    [[ "$ok" =~ ^[oOyY]$ ]] || exit 1
  fi
  APK="$OUT_DIR/my-butler-$PROFILE-$(date +%Y%m%d-%H%M).apk"
  npx eas-cli@latest build --local --profile "$PROFILE" --platform android --output "$APK"
fi

# --- Installation ------------------------------------------------------------
# Le port du débogage sans fil peut changer pendant le build : on revérifie.
if ! list_devices | grep -qx "$DEVICE"; then
  echo "$DEVICE n'est plus connecté."
  pick_device
fi

echo "Installation sur $DEVICE…"
adb -s "$DEVICE" install -r "$APK"
adb -s "$DEVICE" shell monkey -p "$PACKAGE" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true
echo "✅ $PACKAGE installé et lancé sur $DEVICE"
