// Loads names, lines, past trips and photos from private/ into the database, as the organizer.
// Run with: node scripts/load-private.js
// Safe to run again after editing private/content.json, but it only adds and updates:
// something removed from that file stays in the database (see supabase/SETUP.md). Nothing secret is printed.
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const content = JSON.parse(fs.readFileSync(path.join(ROOT, "private", "content.json"), "utf8"));
const config = fs.readFileSync(path.join(ROOT, "js", "store.js"), "utf8").match(/url: "([^"]+)", publishableKey: "([^"]+)"/);
const organizer = content.people.find((p) => p.organizer).id;
const code = fs.readFileSync(path.join(ROOT, "discesa-codes.private.txt"), "utf8").match(new RegExp(`--- ${organizer} ---[\\s\\S]*?#k=([A-Z0-9]+)`))?.[1];
if (!config || !code) throw new Error("Missing the project address in js/store.js or the organizer's code");
const MIME = { ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png" };

const call = async (name, args) => {
  const response = await fetch(`${config[1]}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: config[2], "Content-Type": "application/json" },
    body: JSON.stringify({ p_code: code, ...args }),
  });
  if (!response.ok) throw new Error(`${name}: ${response.status} ${(await response.json().catch(() => ({}))).message}`);
};

(async () => {
  for (const [position, { id, name, line }] of content.people.entries()) {
    await call("set_person", { p_id: id, p_name: name, p_line: line, p_position: position });
  }
  for (const { year, place, cost } of content.pastTrips) {
    await call("set_past_trip", { p_year: year, p_place: place, p_cost: cost });
  }
  for (const [position, { id, year, alt, width, height, file }] of content.photos.entries()) {
    await call("save_photo", {
      p_id: id, p_year: year, p_alt: alt, p_width: width, p_height: height, p_position: position,
      p_mime: MIME[path.extname(file)],
      p_data: fs.readFileSync(path.join(ROOT, "private", "photos", file)).toString("base64"),
    });
  }
  console.log(`Loaded ${content.people.length} people, ${content.pastTrips.length} trips, ${content.photos.length} photos. Anything removed from content.json is still in the database.`);
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
