#!/bin/sh
# MODE env var: api (default) | wrk
exec node main.js "${MODE:-api}"
