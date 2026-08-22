#!/bin/sh
set -eu

SOURCE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PI_AGENT_DIR=${PI_AGENT_DIR:-"$HOME/.pi/agent"}

if [ -z "$PI_AGENT_DIR" ] || [ "$PI_AGENT_DIR" = "/" ]; then
	printf 'Invalid PI_AGENT_DIR: %s\n' "$PI_AGENT_DIR" >&2
	exit 1
fi

mkdir -p "$PI_AGENT_DIR/agents" "$PI_AGENT_DIR/extensions"

sync_file() {
	source=$1
	destination=$2
	install -m 0644 "$source" "$destination"
	cmp -s "$source" "$destination" || {
		printf 'Failed to verify %s\n' "$destination" >&2
		exit 1
	}
	printf 'Synced %s\n' "$destination"
}

sync_file "$SOURCE_DIR/APPEND_SYSTEM.md" "$PI_AGENT_DIR/APPEND_SYSTEM.md"
sync_file "$SOURCE_DIR/settings.json" "$PI_AGENT_DIR/settings.json"

SDD_COMMON="$SOURCE_DIR/references/sdd-phase-common.md"
SDD_AGENTS=" lsar-manager lsar-analyst lsar-lead lsar-research lsar-coder lsar-verify "

for source in "$SOURCE_DIR"/agents/*.md; do
	[ -e "$source" ] || continue
	base=$(basename "$source" .md)
	case "$SDD_AGENTS" in
	*" $base "*)
		tmp=$(mktemp)
		{
			cat "$source"
			printf '\n\n'
			cat "$SDD_COMMON"
		} >"$tmp"
		sync_file "$tmp" "$PI_AGENT_DIR/agents/$base.md"
		rm -f "$tmp"
		;;
	*)
		sync_file "$source" "$PI_AGENT_DIR/agents/$base.md"
		;;
	esac
done

for source in "$SOURCE_DIR"/extensions/*.ts; do
	[ -e "$source" ] || continue
	sync_file "$source" "$PI_AGENT_DIR/extensions/$(basename "$source")"
done

if [ -d "$SOURCE_DIR/references" ]; then
	find "$SOURCE_DIR/references" -type f | while IFS= read -r source; do
		rel_path=${source#"$SOURCE_DIR/references/"}
		destination="$PI_AGENT_DIR/references/$rel_path"
		mkdir -p "$(dirname "$destination")"
		sync_file "$source" "$destination"
	done
fi

printf '\nSync complete. Run /reload in Pi to activate the changes.\n'
