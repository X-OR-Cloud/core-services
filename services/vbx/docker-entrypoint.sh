#!/bin/sh
# MODE env var: api (default) | wrk
case "${MODE:-api}" in
  wrk) exec node worker.main.js ;;
  *)   exec node api.main.js ;;
esac
