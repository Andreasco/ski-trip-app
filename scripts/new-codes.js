// Creates everyone's secret skipass code. Run once with the published address:
//   node scripts/new-codes.js https://example.github.io/ski-trip-app/
// Writes messages to send and the SQL to run to discesa-codes.private.txt in the project root, ignored by git.
// Nothing secret is printed. Pass --rotate to replace existing codes.
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const content = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "private", "content.json"), "utf8"));

const OUT = path.join(__dirname, "..", "discesa-codes.private.txt");
// Easy to read aloud: no 0/O or 1/I/L. Eight characters give about 40 bits.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

const site = process.argv.slice(2).find((arg) => arg.startsWith("http"));
if (!site) {
  console.error("Pass the published address, for example https://example.github.io/ski-trip-app/");
  process.exit(1);
}
if (fs.existsSync(OUT) && !process.argv.includes("--rotate")) {
  console.error(`${OUT} already exists. Pass --rotate to replace the codes.`);
  process.exit(1);
}

const newCode = () => Array.from({ length: 8 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join("");
const rows = content.people.map(({ id: person, organizer }) => {
  const code = newCode();
  return { person, organizer: Boolean(organizer), code, hash: crypto.createHash("sha256").update(code).digest("hex") };
});
const base = site.endsWith("/") ? site : `${site}/`;
const messages = rows.map(({ person, code }) => `--- ${person} ---
Ecco il tuo skipass per La Discesa 2027: ${base}#k=${code}
Se l'app ti chiede il codice: ${code.slice(0, 4)}-${code.slice(4)}
È solo tuo: non inoltrarlo.
`);
const values = rows.map(({ person, hash, organizer }) => `  ('${person}', '${hash}', ${organizer})`);

fs.writeFileSync(OUT, `PRIVATE: do not share this file or put it in the site.

MESSAGES: send each one only to its owner.
${messages.join("\n")}

SQL: run once in the Supabase SQL editor, after schema.sql.
insert into people (id, code_hash, organizer) values
${values.join(",\n")}
on conflict (id) do update set code_hash = excluded.code_hash, organizer = excluded.organizer;
`);
console.log(`Written to ${OUT}`);
