export const authService = {
  // Password login
  async login(email: string, password: string) {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    return res.json();
  },

  // Email OTP
  async verifyEmailOtp(userId: string, otp: string) {
    const res = await fetch("/api/totp/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    return res.json();
  },

  //TOTP Setup with Microsoft Auth
  async setupTOTP(userId: string) {
    const res = await fetch("/api/totp/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
  },
};
