// Operations helper. Reads existing credentials in memory; never prints them.
// No recipient messages are sent by this script.
import { execFileSync } from "node:child_process";

const definitions = {
  mandir_family_arrival_meals: {
    body: "Jai Swaminarayan, {{1}}.\n\nOn your registered arrival date of {{2}}, when do you plan to reach the mandir?\n\nMorning: breakfast, lunch and dinner.\nBefore noon: lunch and dinner.\nBefore evening: dinner.\n\nPlease select one option for your family.",
    choices: [["Morning", "morning"], ["Before noon", "before_noon"], ["Before evening", "before_evening"]],
  },
  mandir_family_chaturmas_meals: {
    body: "Jai Swaminarayan, {{1}}.\n\nFor your mandir stay beginning {{2}}, are you doing upvas (fasting) for Chaturmas?\n\nNo\nYes (I eat once only, for lunch)\nYes (I eat once only, for dinner)\n\nPlease select one option for your family. We will use your answer to plan meals for every day of your stay.",
    choices: [["No", "no"], ["Yes, lunch only", "lunch"], ["Yes, dinner only", "dinner"]],
  },
};
const settings = JSON.parse(execFileSync("az", ["functionapp", "config", "appsettings", "list", "--resource-group", "rg-sahebjiyouth-reg", "--name", "sahebjiyouth-reg-api", "-o", "json"], { encoding: "utf8" }));
const env = Object.fromEntries(settings.map(item => [item.name, item.value]));
if (!/^AC[0-9a-f]{32}$/i.test(env.TWILIO_ACCOUNT_SID || "") || env.TWILIO_WHATSAPP_FROM !== "whatsapp:+16105021100") throw Error("Unexpected Twilio account or sender configuration.");
const authorization = "Basic " + Buffer.from(`${env.TWILIO_API_KEY}:${env.TWILIO_API_SECRET}`).toString("base64");
async function request(path, body) {
  const response = await fetch(`https://content.twilio.com${path}`, { method: body ? "POST" : "GET", headers: { Authorization: authorization, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) });
  const result = await response.json();
  if (!response.ok) throw Error(`Twilio content request failed: HTTP ${response.status}, code ${result.code || "unknown"}, ${result.message || ""}`);
  return result;
}
const list = await request("/v1/Content?PageSize=100");
for (const [name, definition] of Object.entries(definitions)) {
  let content = list.contents.find(item => item.friendly_name === name);
  if (!content && process.argv.includes("--create")) {
    content = await request("/v1/Content", { friendly_name: name, language: "en", variables: {
      "1": "Example Family", "2": "October 20, 2026",
      ...Object.fromEntries(definition.choices.map(([, value], index) => [String(index + 3), `yp:${"0".repeat(32)}:${value}`])),
    }, types: { "twilio/quick-reply": { body: definition.body, actions: definition.choices.map(([title], index) => ({ title, id: `{{${index + 3}}}` })) } } });
  }
  if (!content) { console.log(JSON.stringify({ name, status: "not_created" })); continue; }
  const actual = content.types?.["twilio/quick-reply"];
  if (actual?.body !== definition.body || actual.actions?.length !== definition.choices.length || definition.choices.some(([title], index) => actual.actions[index]?.title !== title || actual.actions[index]?.id !== `{{${index + 3}}}`)) throw Error(`${name} exists with different content; review before changing it.`);
  let approval = await request(`/v1/Content/${content.sid}/ApprovalRequests`);
  if (process.argv.includes("--approve") && (!approval.whatsapp?.status || approval.whatsapp.status === "unsubmitted")) approval = await request(`/v1/Content/${content.sid}/ApprovalRequests/whatsapp`, { name, category: "UTILITY" });
  console.log(JSON.stringify({ name, sid: content.sid, approval, body: actual.body, buttons: actual.actions.map(item => item.title) }));
}
