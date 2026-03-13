// test-validation.js
const API_URL = "http://localhost:5050/api";

async function runTests() {
  console.log("🛡️ Starting Input Validation Pentest...\n");

  // TEST 1: The "Missing Array" Crash Test
  // We send a vault upload without the 'shards' array. If the server doesn't validate this,
  // shards.map() will cause a fatal 500 server crash.
  try {
    console.log("Test 1: Uploading asset with missing 'shards' array...");
    const res = await fetch(`${API_URL}/vault/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: "60d5ecb8b392d70015332211",
        encryptedData: "bad-data",
        // Notice: 'shards' is intentionally missing
      }),
    });
    console.log(`Result: HTTP ${res.status} (If 500, your server crashed!)\n`);
  } catch (err) {
    console.log("Result: Request failed entirely.\n");
  }

  // TEST 2: The "Wrong Data Type" Test
  // Passing a number into a field that expects a string (like password).
  try {
    console.log("Test 2: Registering user with an integer as a password...");
    const res = await fetch(`${API_URL}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "hacker123",
        email: "hacker@test.com",
        password: 123456789, // Libsodium expects a string, this might crash it!
      }),
    });
    console.log(`Result: HTTP ${res.status} (If 500, Libsodium crashed!)\n`);
  } catch (err) {}

  // TEST 3: The "Empty String" Bypass
  // Trying to register a user with completely empty strings.
  try {
    console.log("Test 3: Registering with empty strings...");
    const res = await fetch(`${API_URL}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "",
        email: "",
        password: "",
      }),
    });
    console.log(
      `Result: HTTP ${res.status} (If 201, your DB accepted empty data!)\n`,
    );
  } catch (err) {}

  console.log(
    "🏁 Tests complete. Check your backend terminal to see if it crashed!",
  );
}

runTests();
