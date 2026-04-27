#!/bin/sh
# MODE env var: api (default) | emb | rtc
exec node main.js "${MODE:-api}"
