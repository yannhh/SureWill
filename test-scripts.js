// This bypasses the signed certificate, so this test validation works on HTTPS
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const API_URL = "https://localhost:5050/api";

async function runTests() {
  console.log("Automated JavaScript test\n");

  // Missing Shards Array (Denial of Service attempt)
  console.log("Test 1: Uploading asset with missing 'shards' array...");
  try {
    const res1 = await fetch(`${API_URL}/vault/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: "60d5ecb8b392d70015332211",
        encryptedData: "bad-data",
        // shards array is missing
      }),
    });

    // Read the exact response from server
    const data1 = await res1.json();
    console.log(`Status: HTTP ${res1.status}`);
    console.log(`Server Reply:`, data1);
  } catch (err) {
    console.log(`Network Error:`, err.message);
  }
  console.log("--------------------------------------------------\n");

  // Wrong Data Type (Crashing the Crypto Engine)
  console.log(
    "Test 2: Registering with an integer instead of a password string...",
  );
  try {
    const res2 = await fetch(`${API_URL}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "hacker123",
        email: "hacker@test.com",
        password: 123456789, // Libsodium always expects string in my backend
      }),
    });
    const data2 = await res2.json();
    console.log(`Status: HTTP ${res2.status}`);
    console.log(`Server Reply:`, data2);
  } catch (err) {
    console.log(`Network Error:`, err.message);
  }
  console.log("--------------------------------------------------\n");

  // Rate Limiting / Brute Force Attack
  console.log("Test 3: Brute Force Attack on /login (Testing Rate Limiter)...");
  console.log("Sending 12 login requests to overwhelm server...");

  for (let i = 1; i <= 12; i++) {
    try {
      const res3 = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "test@test.com",
          password: "wrongpassword",
        }),
      });

      // 429 for Too Many Requests.
      if (res3.status === 429) {
        const data3 = await res3.json();
        console.log(`Request ${i}: BLOCKED! Status: HTTP 429`);
        console.log(`Server Reply:`, data3);
        break; // If the request has been blocked, it stops.
      } else {
        console.log(`Request ${i}: Status: HTTP ${res3.status} (Allowed)`);
      }
    } catch (err) {
      console.log(`Network Error:`, err.message);
      break;
    }
  }

  // Password Policy Evasion
  console.log("Test 4: Attempting to bypass the Password Policy...");
  try {
    const res4 = await fetch(`${API_URL}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "testuser2",
        email: "test2@test.com",
        password: "weakpassword", // This purposefully fails the strong password test
      }),
    });
    const data4 = await res4.json();
    console.log(`Status: HTTP ${res4.status} (Should be 400)`);
    console.log(`Server Reply:`, data4);
  } catch (err) {
    console.log(`Network Error:`, err.message);
  }
  console.log("--------------------------------------------------\n");

  // NoSQL Injection Attack
  console.log("Test 5: NoSQL Injection on /forgot-password...");
  console.log(
    "Sending a MongoDB Operator {$ne: null} instead of an email string...",
  );
  try {
    const res5 = await fetch(`${API_URL}/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // Cool trick I found online
        // Asking the DB to find an email that is "Not Equal to Null"
        // During early development stages, I would get into the database using this.
        email: { $ne: null },
      }),
    });

    // If this sends a 200OK, my database is vulnerable
    console.log(`Status: HTTP ${res5.status}`);
    const text5 = await res5.text();
    console.log(`Server Reply:`, text5);
  } catch (err) {
    console.log(`Network Error:`, err.message);
  }
  console.log("--------------------------------------------------\n");

  // The "Ghost" Payload (Empty Data)
  console.log("Test 6: Sending an empty request to /login...");
  try {
    const res6 = await fetch(`${API_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}), // blank payload
    });
    const data6 = await res6.json();
    console.log(`  ↳ Status: HTTP ${res6.status}`);
    console.log(`  ↳ Server Reply:`, data6);
  } catch (err) {
    console.log(`  ↳ Network Error:`, err.message);
  }
  console.log("--------------------------------------------------\n");

  console.log("--------------------------------------------------\n");
  console.log("Test Done.");
}

runTests();
