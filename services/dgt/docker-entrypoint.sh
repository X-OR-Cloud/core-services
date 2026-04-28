#!/bin/sh
# MODE env var: api (default) | shd | ing | sig | mon
exec node main.js "${MODE:-api}"
