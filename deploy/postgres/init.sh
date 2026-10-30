#!/bin/sh
# One database and one role per service: services can't read each other's data.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<SQL
CREATE ROLE auth_svc LOGIN PASSWORD '${AUTH_DB_PASSWORD}';
CREATE DATABASE kup_auth OWNER auth_svc;
CREATE ROLE listings_svc LOGIN PASSWORD '${LISTINGS_DB_PASSWORD}';
CREATE DATABASE kup_listings OWNER listings_svc;
REVOKE CONNECT ON DATABASE kup_auth FROM PUBLIC;
REVOKE CONNECT ON DATABASE kup_listings FROM PUBLIC;
SQL
