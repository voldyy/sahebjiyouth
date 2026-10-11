import { fetchMealCounts, tomorrowEastern } from "../notifications/yogi-prasad.js";
const day = process.argv[2] || tomorrowEastern();
if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw Error("Use an ISO date: YYYY-MM-DD");
console.log(JSON.stringify(await fetchMealCounts(day), null, 2));
