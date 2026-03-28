#!/bin/bash

# Configuration
BASE_URL="http://localhost:3001"
PHONE_NUMBER="+919042524161" # Update this in your .env if needed

echo "🚀 AI Call Agent - Feature Testing Script"
echo "----------------------------------------"

# 1. Test SMS Outbound
echo "1. Testing Outbound SMS..."
curl -s "$BASE_URL/sms-outbound?to=$PHONE_NUMBER&message=Hello+from+test+script" | grep -q "success" && echo "✅ SMS Sent" || echo "❌ SMS Failed"

# 2. Test Address Request
echo -e "\n2. Testing Address Request..."
curl -s "$BASE_URL/request-address?to=$PHONE_NUMBER" | grep -q "success" && echo "✅ Address Request Sent" || echo "❌ Failed"

# 3. Test Network Fallback (SMS)
echo -e "\n3. Testing Network Fallback (SMS)..."
curl -s -X POST "$BASE_URL/network-fallback" \
  -H "Content-Type: application/json" \
  -d '{
    "chatId": "'$PHONE_NUMBER'",
    "failedQuery": "What is the capital of France?",
    "phoneNumber": "'$PHONE_NUMBER'",
    "channel": "sms"
  }' | grep -q "success" && echo "✅ Fallback SMS Delivered" || echo "❌ Fallback SMS Failed"

# 4. Test Network Fallback (Call)
echo -e "\n4. Testing Network Fallback (Call)..."
curl -s -X POST "$BASE_URL/network-fallback" \
  -H "Content-Type: application/json" \
  -d '{
    "chatId": "'$PHONE_NUMBER'",
    "failedQuery": "Tell me a joke.",
    "phoneNumber": "'$PHONE_NUMBER'",
    "channel": "call"
  }' | grep -q "success" && echo "✅ Fallback Call Initiated" || echo "❌ Fallback Call Failed"

echo -e "\n----------------------------------------"
echo "Done!"
