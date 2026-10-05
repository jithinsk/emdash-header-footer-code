import { BASE_URL } from "./playwright.config.js";

export default async function globalSetup() {
	// The setup bypass (not auth/dev-bypass) completes first-run setup and creates the dev admin.
	const res = await fetch(`${BASE_URL}/_emdash/api/setup/dev-bypass`);
	if (!res.ok) throw new Error(`dev-bypass failed: ${res.status} ${await res.text()}`);

	// Dismiss the first-login welcome modal once; the flag lives in the user's row, so it
	// survives later logins. Otherwise its overlay intercepts every click on the admin page.
	const cookie = res.headers
		.getSetCookie()
		.map((c) => c.split(";")[0])
		.join("; ");
	const dismissed = await fetch(`${BASE_URL}/_emdash/api/auth/me`, {
		method: "POST",
		headers: { Cookie: cookie, "X-EmDash-Request": "1", "Content-Type": "application/json" },
		body: JSON.stringify({ action: "dismissWelcome" }),
	});
	if (!dismissed.ok) throw new Error(`dismissWelcome failed: ${dismissed.status} ${await dismissed.text()}`);

	// Warm the starter's homepage so Astro compiles emdash/ui components before tests.
	for (let i = 0; i < 3; i++) {
		if ((await fetch(`${BASE_URL}/`)).ok) break;
		await new Promise((r) => setTimeout(r, 1000));
	}
}
