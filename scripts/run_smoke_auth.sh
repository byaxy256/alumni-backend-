#!/usr/bin/env bash
set -euo pipefail

# Smoke test script for mentorship/chat/loan/content endpoints
# Usage: ./scripts/run_smoke_auth.sh [API_BASE]
# Example: ./scripts/run_smoke_auth.sh https://alumni-backend-mupt.onrender.com/api

API_BASE="${1:-https://alumni-backend-mupt.onrender.com/api}"
JQ=$(command -v jq || true)
if [ -z "$JQ" ]; then
  echo "This script requires 'jq' to parse JSON. Install it and re-run."
  exit 1
fi

TS=$(date +%s)
# generate a stronger random suffix (openssl hex) if available, fallback to RANDOM
gen_rand() {
  RAND=$(openssl rand -hex 6 2>/dev/null || echo "$RANDOM$RANDOM")
  echo "$RAND"
}

# try to pick unique emails with up to 5 attempts
TRY_LIMIT=5
STUDENT_EMAIL=""
MENTOR_EMAIL=""
for i in $(seq 1 $TRY_LIMIT); do
  RAND=$(gen_rand)
  STUDENT_EMAIL="student_${TS}_${RAND}@example.com"
  MENTOR_EMAIL="mentor_${TS}_${RAND}@example.com"
  echo "Attempt $i: using emails $STUDENT_EMAIL and $MENTOR_EMAIL"
  break
done
PASSWORD="Passw0rd!"

echo "Using API_BASE=$API_BASE"

echo "\n1) Register test student"
STUDENT_TOKEN=""
STUDENT_ID=""
for attempt in $(seq 1 $TRY_LIMIT); do
  RAND=$(gen_rand)
  STUDENT_EMAIL="student_${TS}_${RAND}@example.com"
  STUDENT_PHONE=$(openssl rand -hex 8 2>/dev/null | tr -dc '0-9' | cut -c1-10)
  echo "Attempt $attempt: registering student with $STUDENT_EMAIL"
  STU_RES=$(curl -s -X POST "$API_BASE/auth/register" \
    -H "Content-Type: application/json" \
    -d "{\"full_name\": \"Test Student\", \"email\": \"$STUDENT_EMAIL\", \"phone\": \"$STUDENT_PHONE\", \"password\": \"$PASSWORD\", \"role\": \"student\", \"meta\": {}}")

  echo "$STU_RES" | jq .
  STUDENT_TOKEN=$(echo "$STU_RES" | jq -r '.token // empty')
  STUDENT_ID=$(echo "$STU_RES" | jq -r '.user.id // empty')
  if [ -n "$STUDENT_TOKEN" ] && [ -n "$STUDENT_ID" ]; then
    echo "Student registered successfully: $STUDENT_ID"
    break
  fi

  echo "Registration failed for student. Trying login with the same email..."
  LOGIN_RES=$(curl -s -X POST "$API_BASE/auth/login" -H "Content-Type: application/json" -d "{\"credential\": \"$STUDENT_EMAIL\", \"password\": \"$PASSWORD\"}")
  echo "$LOGIN_RES" | jq .
  STUDENT_TOKEN=$(echo "$LOGIN_RES" | jq -r '.token // empty')
  STUDENT_ID=$(echo "$LOGIN_RES" | jq -r '.user.id // empty')
  if [ -n "$STUDENT_TOKEN" ] && [ -n "$STUDENT_ID" ]; then
    echo "Student login succeeded for existing account: $STUDENT_ID"
    break
  fi

  echo "Student login failed for $STUDENT_EMAIL; will try a new random email (next attempt)."
  sleep 1
done

if [ -z "$STUDENT_TOKEN" ] || [ -z "$STUDENT_ID" ]; then
  echo "Failed to register or login student after $TRY_LIMIT attempts. Aborting."; exit 1
fi

echo "\n2) Register test mentor"
MENTOR_TOKEN=""
MENTOR_ID=""
for attempt in $(seq 1 $TRY_LIMIT); do
  RAND=$(gen_rand)
  MENTOR_EMAIL="mentor_${TS}_${RAND}@example.com"
  MENTOR_PHONE=$(openssl rand -hex 8 2>/dev/null | tr -dc '0-9' | cut -c1-10)
  echo "Attempt $attempt: registering mentor with $MENTOR_EMAIL"
  MENT_RES=$(curl -s -X POST "$API_BASE/auth/register" \
    -H "Content-Type: application/json" \
    -d "{\"full_name\": \"Test Mentor\", \"email\": \"$MENTOR_EMAIL\", \"phone\": \"$MENTOR_PHONE\", \"password\": \"$PASSWORD\", \"role\": \"alumni\", \"meta\": {\"field\": \"Computer Science\", \"expertise\": [\"career\", \"resume\" ]}}")

  echo "$MENT_RES" | jq .
  MENTOR_TOKEN=$(echo "$MENT_RES" | jq -r '.token // empty')
  MENTOR_ID=$(echo "$MENT_RES" | jq -r '.user.id // empty')
  if [ -n "$MENTOR_TOKEN" ] && [ -n "$MENTOR_ID" ]; then
    echo "Mentor registered successfully: $MENTOR_ID"
    break
  fi

  echo "Registration failed for mentor. Trying login with the same email..."
  LOGIN_RES=$(curl -s -X POST "$API_BASE/auth/login" -H "Content-Type: application/json" -d "{\"credential\": \"$MENTOR_EMAIL\", \"password\": \"$PASSWORD\"}")
  echo "$LOGIN_RES" | jq .
  MENTOR_TOKEN=$(echo "$LOGIN_RES" | jq -r '.token // empty')
  MENTOR_ID=$(echo "$LOGIN_RES" | jq -r '.user.id // empty')
  if [ -n "$MENTOR_TOKEN" ] && [ -n "$MENTOR_ID" ]; then
    echo "Mentor login succeeded for existing account: $MENTOR_ID"
    break
  fi

  echo "Mentor login failed for $MENTOR_EMAIL; will try a new random email (next attempt)."
  sleep 1
done

if [ -z "$MENTOR_TOKEN" ] || [ -z "$MENTOR_ID" ]; then
  echo "Failed to register or login mentor after $TRY_LIMIT attempts. Aborting."; exit 1
fi

echo "\n3) Authenticated GET /api/mentors (student)"
curl -s -H "Authorization: Bearer $STUDENT_TOKEN" "$API_BASE/mentors" | jq .

echo "\n4) Student requests mentorship (POST /api/mentors/request)"
REQ_RES=$(curl -s -X POST "$API_BASE/mentors/request" -H "Content-Type: application/json" -H "Authorization: Bearer $STUDENT_TOKEN" -d "{\"mentorId\": \"$MENTOR_ID\"}")

echo "$REQ_RES" | jq .

echo "\n5) Mentor views pending requests (this endpoint not implemented explicitly; checking mentor meta via /api/auth/me)
"
ME_MENTOR=$(curl -s -H "Authorization: Bearer $MENTOR_TOKEN" "$API_BASE/auth/me")
echo "$ME_MENTOR" | jq .

echo "\n6) Mentor approves request (POST /api/mentors/approve)"
APPR=$(curl -s -X POST "$API_BASE/mentors/approve" -H "Content-Type: application/json" -H "Authorization: Bearer $MENTOR_TOKEN" -d "{\"studentId\": \"$STUDENT_ID\"}")

echo "$APPR" | jq .

echo "\n7) Student: GET /api/mentors/my-mentors"
curl -s -H "Authorization: Bearer $STUDENT_TOKEN" "$API_BASE/mentors/my-mentors" | jq .

echo "\n8) Loans: GET /api/loans/mine (student)"
curl -s -H "Authorization: Bearer $STUDENT_TOKEN" "$API_BASE/loans/mine" | jq .

echo "\n9) Content: GET /api/content/news and test image for first news item (if any)"
NEWS=$(curl -s "$API_BASE/content/news")
echo "$NEWS" | jq .
FIRST_ID=$(echo "$NEWS" | jq -r '.[0].id // empty')
HAS_IMG=$(echo "$NEWS" | jq -r '.[0].hasImage // false')
if [ -n "$FIRST_ID" ] && [ "$HAS_IMG" = "true" ]; then
  echo "Found first news id=$FIRST_ID with image -> requesting image headers"
  curl -s -I "$API_BASE/content/news/$FIRST_ID/image" | sed -n '1,20p'
else
  echo "No image found on first news item or no news available."
fi

echo "\nSmoke test script completed. Clean up: if you want these test users removed, delete them manually from the DB or via admin tools."

exit 0
