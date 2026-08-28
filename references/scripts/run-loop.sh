#!/bin/bash

SCRIPT_PATH="./keep-claude-alive.scpt"

while true; do
    echo "[$(date)] Ejecutando Claude..."
    osascript "$SCRIPT_PATH"

    # Genera un tiempo aleatorio entre 7200s (2h) y 14400s (4h)
    WAIT_TIME=$((7200 + RANDOM % 7201))
    HOURS=$(echo "scale=2; $WAIT_TIME / 3600" | bc)
    echo "[$(date)] Próxima ejecución en aproximadamente $HOURS horas ($WAIT_TIME segundos)."

    sleep $WAIT_TIME
done

# RUN with nohup ./run-loop.sh > claude-runner.log 2>&1 &