#!/bin/sh
# MODE env var: api (default) | mcp | worker | agt | con | aws | nws | cws
exec node main.js "${MODE:-api}"
