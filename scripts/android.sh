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

# Téléphones en débogage sans fil annoncés sur le réseau (mDNS, via dns-sd de macOS) : « numéro_de_série ip:port ».
# Le port change à chaque activation du débogage sans fil, d'où la recherche plutôt qu'une saisie.
discover_wireless() {
  command -v dns-sd >/dev/null || return 0
  local name host port ip serial
  dns-sd -t 2 -B _adb-tls-connect._tcp 2>/dev/null | awk '$2=="Add"{print $NF}' | sort -u |
    while read -r name; do
      read -r host port < <(dns-sd -t 1 -L "$name" _adb-tls-connect._tcp local. 2>/dev/null |
        sed -n 's/.*can be reached at \(.*\)\.:\([0-9]*\).*/\1 \2/p' | head -1) || continue
      [[ -n "${port:-}" ]] || continue
      ip="$(dns-sd -t 1 -G v4 "$host" 2>/dev/null | awk '$2=="Add"{print $(NF-1)}' | head -1)"
      # Nom du service : adb-<numéro de série>-<suffixe>
      serial="${name#adb-}"
      echo "${serial%-*} ${ip:-$host}:$port"
    done
}

pick_device() {
  local ids labels d state info model serial kind addr code connected
  while true; do
    # Les connexions sans fil mortes (ancien port) restent « offline » : on les retire.
    adb devices | awk 'NR>1 && $2=="offline" && $1 ~ /:/ {print $1}' | while read -r d; do
      adb disconnect "$d" >/dev/null 2>&1 || true
    done

    ids=()
    labels=()
    connected=" "
    while read -r d state; do
      connected+="$d "
      if [[ "$state" == device ]]; then
        info="$(adb -s "$d" shell 'getprop ro.product.model; getprop ro.serialno' 2>/dev/null | tr -d '\r')"
        model="$(echo "$info" | sed -n 1p)"
        serial="$(echo "$info" | sed -n 2p)"
        connected+="$serial "
        case "$d" in
          emulator-*) kind="émulateur" ;;
          *:* | *._adb-tls-connect._tcp) kind="sans fil" ;;
          *) kind="USB" ;;
        esac
        ids+=("$d")
        labels+=("$model — $kind")
      else
        ids+=("")
        labels+=("$d — $state")
      fi
    done < <(adb devices | awk 'NR>1 && NF>=2 {print $1, $2}')

    printf '\033[2mRecherche des téléphones en débogage sans fil…\033[0m' >/dev/tty
    while read -r serial addr; do
      # Déjà connecté (adb se reconnecte souvent tout seul aux téléphones appairés).
      [[ -z "$addr" || "$connected" == *" $addr "* || "$connected" == *" $serial "* ]] && continue
      ids+=("wifi:$addr")
      labels+=("📶 Sans fil, à connecter  ($addr)")
    done < <(discover_wireless)
    printf '\r\033[2K' >/dev/tty

    ids+=(__refresh__ __connect__ __pair__ __quit__)
    labels+=("↻ Rafraîchir la liste" "+ Connecter en sans fil (IP:port)…" "🔑 Appairer avec un code (première fois)…" "✕ Quitter")

    choose "Appareil" "${labels[@]}"
    case "${ids[CHOICE]}" in
      __refresh__) ;;
      __connect__)
        read -rp "IP:port (Débogage sans fil › « Adresse IP et port ») : " addr </dev/tty
        if [[ -n "$addr" ]]; then adb connect "$addr" || true; fi
        ;;
      __pair__)
        echo "Sur le téléphone : Débogage sans fil › Associer l'appareil avec un code d'association."
        read -rp "IP:port affichés sous le code : " addr </dev/tty
        read -rp "Code à 6 chiffres : " code </dev/tty
        if [[ -n "$addr" && -n "$code" ]]; then adb pair "$addr" "$code" || true; fi
        ;;
      __quit__) exit 1 ;;
      "") echo "Appareil inutilisable : autorise le débogage sur le téléphone, puis rafraîchis." ;;
      wifi:*)
        addr="${ids[CHOICE]#wifi:}"
        if adb connect "$addr" | grep -q '^connected\|already connected'; then
          sleep 1
          if list_devices | grep -qx "$addr"; then
            DEVICE="$addr"
            break
          fi
        fi
        echo "Connexion impossible à $addr : si c'est la première fois, appaire d'abord avec un code."
        ;;
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
  [[ "$DEVICE" == *:* ]] && adb connect "$DEVICE" >/dev/null 2>&1 && sleep 1 || true
  if ! list_devices | grep -qx "$DEVICE"; then
    echo "$DEVICE n'est plus connecté."
    pick_device
  fi
fi

echo "Installation sur ${DEVICE}…"
adb -s "$DEVICE" install -r "$APK"
adb -s "$DEVICE" shell monkey -p "$PACKAGE" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true
echo "✅ $PACKAGE installé et lancé sur $DEVICE"
